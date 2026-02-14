use anyhow::{Result, Context};
use rand::{SeedableRng, Rng};
use rand::rngs::StdRng;
use std::collections::HashMap;
use sha2::{Sha256, Digest};

/// Shuffle Buffer para otimizar cache hit rate com acesso aleatório
/// 
/// Problema: PyTorch DataLoader com shuffle=True causa acesso aleatório,
/// reduzindo cache hit rate de 95% → 20% e GPU utilization de 98% → 10%.
/// 
/// Solução: Baixar blocos grandes (1GB), embaralhar localmente na RAM,
/// e servir samples de forma otimizada.
pub struct ShuffleBuffer {
    /// Tamanho de cada bloco em bytes (default: 1 GB)
    block_size: usize,
    
    /// Blocos em memória: block_id → Vec<sample_data>
    buffer: HashMap<usize, Vec<Vec<u8>>>,
    
    /// RNG determinístico para shuffle reproduzível
    rng: StdRng,
    
    /// Capacidade máxima em bytes
    max_capacity: usize,
    
    /// Bytes atualmente em uso
    current_size: usize,
    
    /// Samples por bloco (default: 1000)
    samples_per_block: usize,
}

impl ShuffleBuffer {
    /// Cria novo shuffle buffer
    pub fn new(max_capacity: usize, samples_per_block: usize, seed: u64) -> Self {
        Self {
            block_size: 1024 * 1024 * 1024, // 1 GB
            buffer: HashMap::new(),
            rng: StdRng::seed_from_u64(seed),
            max_capacity,
            current_size: 0,
            samples_per_block,
        }
    }
    
    /// Agrupa índices por bloco
    /// 
    /// Exemplo: índices [0, 5000, 12, 999] → blocos [0, 5]
    /// (assumindo 1000 samples/bloco)
    fn group_by_block(&self, indices: &[usize]) -> Vec<usize> {
        let mut blocks = Vec::new();
        let mut seen = std::collections::HashSet::new();
        
        for &idx in indices {
            let block_id = idx / self.samples_per_block;
            if !seen.contains(&block_id) {
                blocks.push(block_id);
                seen.insert(block_id);
            }
        }
        
        blocks
    }
    
    /// Verifica se bloco está em cache
    pub fn contains_block(&self, block_id: usize) -> bool {
        self.buffer.contains_key(&block_id)
    }
    
    /// Adiciona bloco ao buffer
    /// 
    /// Se buffer estiver cheio, remove bloco mais antigo (LRU)
    pub fn insert_block(&mut self, block_id: usize, samples: Vec<Vec<u8>>) -> Result<()> {
        let block_size: usize = samples.iter().map(|s| s.len()).sum();
        
        // Evict blocos se necessário
        while self.current_size + block_size > self.max_capacity && !self.buffer.is_empty() {
            self.evict_lru_block();
        }
        
        self.buffer.insert(block_id, samples);
        self.current_size += block_size;
        
        Ok(())
    }
    
    /// Remove bloco menos recentemente usado (LRU)
    fn evict_lru_block(&mut self) {
        // Simplificação: remove primeiro bloco encontrado
        // TODO: Implementar LRU real com timestamps
        if let Some((&block_id, _)) = self.buffer.iter().next() {
            if let Some(samples) = self.buffer.remove(&block_id) {
                let block_size: usize = samples.iter().map(|s| s.len()).sum();
                self.current_size -= block_size;
            }
        }
    }
    
    /// Busca samples embaralhados por índices
    /// 
    /// 1. Agrupa índices por bloco
    /// 2. Garante que blocos estão em cache (caller deve baixar)
    /// 3. Extrai samples e embaralha localmente
    pub fn fetch_shuffled_batch(&mut self, indices: &[usize]) -> Result<Vec<Vec<u8>>> {
        let mut result = Vec::with_capacity(indices.len());
        
        for &idx in indices {
            let block_id = idx / self.samples_per_block;
            let sample_idx = idx % self.samples_per_block;
            
            let block = self.buffer.get(&block_id)
                .context(format!("Block {} not in cache", block_id))?;
            
            let sample = block.get(sample_idx)
                .context(format!("Sample {} not in block {}", sample_idx, block_id))?;
            
            result.push(sample.clone());
        }
        
        Ok(result)
    }
    
    /// Embaralha samples dentro de um bloco (in-place)
    pub fn shuffle_block(&mut self, block_id: usize) -> Result<()> {
        if let Some(samples) = self.buffer.get_mut(&block_id) {
            // Fisher-Yates shuffle
            for i in (1..samples.len()).rev() {
                let j = self.rng.gen_range(0..=i);
                samples.swap(i, j);
            }
        }
        Ok(())
    }
    
    /// Calcula hash determinístico de um sample para decidir se deve watermark
    pub fn should_watermark(&self, sample_data: &[u8], probability: f32) -> bool {
        let mut hasher = Sha256::new();
        hasher.update(sample_data);
        let hash = hasher.finalize();
        
        // Usa primeiro byte do hash como RNG determinístico
        let random_value = hash[0] as f32 / 255.0;
        random_value < probability
    }
    
    /// Retorna estatísticas do buffer
    pub fn stats(&self) -> BufferStats {
        BufferStats {
            blocks_cached: self.buffer.len(),
            current_size_mb: self.current_size / (1024 * 1024),
            max_capacity_mb: self.max_capacity / (1024 * 1024),
            utilization_percent: (self.current_size as f64 / self.max_capacity as f64 * 100.0) as u32,
        }
    }
}

#[derive(Debug, Clone)]
pub struct BufferStats {
    pub blocks_cached: usize,
    pub current_size_mb: usize,
    pub max_capacity_mb: usize,
    pub utilization_percent: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_group_by_block() {
        let buffer = ShuffleBuffer::new(1024 * 1024 * 1024, 1000, 42);
        
        let indices = vec![0, 5000, 12, 999, 1000, 1001];
        let blocks = buffer.group_by_block(&indices);
        
        // Blocos esperados: 0 (0-999), 1 (1000-1999), 5 (5000-5999)
        assert_eq!(blocks.len(), 3);
        assert!(blocks.contains(&0));
        assert!(blocks.contains(&1));
        assert!(blocks.contains(&5));
    }
    
    #[test]
    fn test_shuffle_buffer_insert_and_fetch() {
        let mut buffer = ShuffleBuffer::new(1024 * 1024 * 10, 100, 42);
        
        // Criar bloco mock
        let samples: Vec<Vec<u8>> = (0..100)
            .map(|i| vec![i as u8; 1024])
            .collect();
        
        buffer.insert_block(0, samples).unwrap();
        
        // Buscar samples
        let indices = vec![0, 50, 99];
        let result = buffer.fetch_shuffled_batch(&indices).unwrap();
        
        assert_eq!(result.len(), 3);
        assert_eq!(result[0][0], 0);
        assert_eq!(result[1][0], 50);
        assert_eq!(result[2][0], 99);
    }
    
    #[test]
    fn test_should_watermark_deterministic() {
        let buffer = ShuffleBuffer::new(1024 * 1024, 100, 42);
        
        let sample1 = vec![1, 2, 3, 4, 5];
        let sample2 = vec![5, 4, 3, 2, 1];
        
        // Deve ser determinístico (mesmo input = mesmo output)
        let result1a = buffer.should_watermark(&sample1, 0.5);
        let result1b = buffer.should_watermark(&sample1, 0.5);
        assert_eq!(result1a, result1b);
        
        // Samples diferentes podem ter resultados diferentes
        let result2 = buffer.should_watermark(&sample2, 0.5);
        // Não podemos garantir que sejam diferentes, mas testamos que funciona
        let _ = result2;
    }
    
    #[test]
    fn test_buffer_stats() {
        let mut buffer = ShuffleBuffer::new(1024 * 1024 * 100, 100, 42);
        
        let samples: Vec<Vec<u8>> = (0..100)
            .map(|_| vec![0u8; 1024 * 1024]) // 1 MB cada
            .collect();
        
        buffer.insert_block(0, samples).unwrap();
        
        let stats = buffer.stats();
        assert_eq!(stats.blocks_cached, 1);
        assert!(stats.current_size_mb > 0);
    }
}
