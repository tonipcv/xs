use anyhow::Result;
use image::{DynamicImage, GenericImageView, GenericImage, ImageBuffer, Rgba};

/// OCR-based pixel scrubber for DICOM images
/// Detects and removes burned-in text (PHI) from medical images
/// Common in ultrasound, X-rays, and CT scans where patient info is overlaid

#[derive(Debug, Clone)]
pub struct TextRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub confidence: f32,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct ScrubberConfig {
    pub min_confidence: f32,
    pub padding: u32,
    pub blur_radius: u32,
    pub detect_edges: bool,
}

impl Default for ScrubberConfig {
    fn default() -> Self {
        Self {
            min_confidence: 0.6,
            padding: 5,
            blur_radius: 10,
            detect_edges: true,
        }
    }
}

/// Detect text regions in image using edge detection and connected components
/// This is a lightweight alternative to full OCR when Tesseract is not available
pub fn detect_text_regions_simple(img: &DynamicImage, config: &ScrubberConfig) -> Vec<TextRegion> {
    let gray = img.to_luma8();
    let (width, height) = gray.dimensions();
    
    let mut regions = Vec::new();
    
    // Simple edge detection using Sobel-like operator
    let mut edges = ImageBuffer::new(width, height);
    
    for y in 1..height-1 {
        for x in 1..width-1 {
            let gx = 
                gray.get_pixel(x+1, y-1).0[0] as i32 + 2 * gray.get_pixel(x+1, y).0[0] as i32 + gray.get_pixel(x+1, y+1).0[0] as i32
                - gray.get_pixel(x-1, y-1).0[0] as i32 - 2 * gray.get_pixel(x-1, y).0[0] as i32 - gray.get_pixel(x-1, y+1).0[0] as i32;
            
            let gy = 
                gray.get_pixel(x-1, y+1).0[0] as i32 + 2 * gray.get_pixel(x, y+1).0[0] as i32 + gray.get_pixel(x+1, y+1).0[0] as i32
                - gray.get_pixel(x-1, y-1).0[0] as i32 - 2 * gray.get_pixel(x, y-1).0[0] as i32 - gray.get_pixel(x+1, y-1).0[0] as i32;
            
            let magnitude = ((gx * gx + gy * gy) as f32).sqrt();
            let edge_value = if magnitude > 128.0 { 255 } else { 0 };
            
            edges.put_pixel(x, y, image::Luma([edge_value]));
        }
    }
    
    // Find connected components (text-like regions)
    let mut visited = vec![vec![false; width as usize]; height as usize];
    
    for y in 0..height {
        for x in 0..width {
            if edges.get_pixel(x, y).0[0] > 128 && !visited[y as usize][x as usize] {
                let region = flood_fill(&edges, &mut visited, x, y);
                
                // Filter regions by size (text regions are typically rectangular and medium-sized)
                if region.width >= 20 && region.width <= width / 3 
                    && region.height >= 10 && region.height <= height / 4
                    && region.width > region.height // Text is usually wider than tall
                {
                    regions.push(TextRegion {
                        x: region.x,
                        y: region.y,
                        width: region.width,
                        height: region.height,
                        confidence: 0.7, // Heuristic confidence
                        text: "[DETECTED]".to_string(),
                    });
                }
            }
        }
    }
    
    // Merge overlapping regions
    merge_overlapping_regions(&mut regions);
    
    regions
}

#[derive(Debug, Clone)]
struct BoundingBox {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

fn flood_fill(
    edges: &ImageBuffer<image::Luma<u8>, Vec<u8>>,
    visited: &mut Vec<Vec<bool>>,
    start_x: u32,
    start_y: u32,
) -> BoundingBox {
    let (width, height) = edges.dimensions();
    let mut stack = vec![(start_x, start_y)];
    let mut min_x = start_x;
    let mut max_x = start_x;
    let mut min_y = start_y;
    let mut max_y = start_y;
    
    while let Some((x, y)) = stack.pop() {
        if x >= width || y >= height || visited[y as usize][x as usize] {
            continue;
        }
        
        if edges.get_pixel(x, y).0[0] <= 128 {
            continue;
        }
        
        visited[y as usize][x as usize] = true;
        
        min_x = min_x.min(x);
        max_x = max_x.max(x);
        min_y = min_y.min(y);
        max_y = max_y.max(y);
        
        // 4-connectivity
        if x > 0 { stack.push((x - 1, y)); }
        if x < width - 1 { stack.push((x + 1, y)); }
        if y > 0 { stack.push((x, y - 1)); }
        if y < height - 1 { stack.push((x, y + 1)); }
    }
    
    BoundingBox {
        x: min_x,
        y: min_y,
        width: max_x.saturating_sub(min_x) + 1,
        height: max_y.saturating_sub(min_y) + 1,
    }
}

fn merge_overlapping_regions(regions: &mut Vec<TextRegion>) {
    let mut i = 0;
    while i < regions.len() {
        let mut j = i + 1;
        while j < regions.len() {
            if regions_overlap(&regions[i], &regions[j]) {
                // Merge j into i
                let merged = merge_regions(&regions[i], &regions[j]);
                regions[i] = merged;
                regions.remove(j);
            } else {
                j += 1;
            }
        }
        i += 1;
    }
}

fn regions_overlap(a: &TextRegion, b: &TextRegion) -> bool {
    let a_right = a.x + a.width;
    let a_bottom = a.y + a.height;
    let b_right = b.x + b.width;
    let b_bottom = b.y + b.height;
    
    !(a_right < b.x || b_right < a.x || a_bottom < b.y || b_bottom < a.y)
}

fn merge_regions(a: &TextRegion, b: &TextRegion) -> TextRegion {
    let min_x = a.x.min(b.x);
    let min_y = a.y.min(b.y);
    let max_x = (a.x + a.width).max(b.x + b.width);
    let max_y = (a.y + a.height).max(b.y + b.height);
    
    TextRegion {
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
        confidence: a.confidence.max(b.confidence),
        text: format!("{} + {}", a.text, b.text),
    }
}

/// Scrub detected text regions from image
pub fn scrub_text_regions(
    img: &DynamicImage,
    regions: &[TextRegion],
    config: &ScrubberConfig,
) -> DynamicImage {
    let mut output = img.clone();
    
    for region in regions {
        // Add padding
        let x = region.x.saturating_sub(config.padding);
        let y = region.y.saturating_sub(config.padding);
        let width = (region.width + 2 * config.padding).min(img.width() - x);
        let height = (region.height + 2 * config.padding).min(img.height() - y);
        
        // Black out the region
        for py in y..y+height {
            for px in x..x+width {
                if px < img.width() && py < img.height() {
                    output.put_pixel(px, py, Rgba([0, 0, 0, 255]));
                }
            }
        }
        
        tracing::info!(
            "Scrubbed text region at ({}, {}) size {}x{} confidence={:.2}",
            region.x, region.y, region.width, region.height, region.confidence
        );
    }
    
    output
}

/// Advanced scrubbing with inpainting (fills scrubbed regions intelligently)
pub fn scrub_with_inpainting(
    img: &DynamicImage,
    regions: &[TextRegion],
    config: &ScrubberConfig,
) -> DynamicImage {
    let mut output = img.clone();
    
    for region in regions {
        let x = region.x.saturating_sub(config.padding);
        let y = region.y.saturating_sub(config.padding);
        let width = (region.width + 2 * config.padding).min(img.width() - x);
        let height = (region.height + 2 * config.padding).min(img.height() - y);
        
        // Simple inpainting: use median of surrounding pixels
        let mut surrounding_pixels = Vec::new();
        
        // Sample border pixels
        for py in y.saturating_sub(5)..y {
            for px in x..x+width {
                if px < img.width() && py < img.height() {
                    surrounding_pixels.push(img.get_pixel(px, py));
                }
            }
        }
        
        for py in y+height..y+height+5 {
            for px in x..x+width {
                if px < img.width() && py < img.height() {
                    surrounding_pixels.push(img.get_pixel(px, py));
                }
            }
        }
        
        // Calculate median color
        let fill_color = if !surrounding_pixels.is_empty() {
            let r_median = median_channel(&surrounding_pixels, 0);
            let g_median = median_channel(&surrounding_pixels, 1);
            let b_median = median_channel(&surrounding_pixels, 2);
            Rgba([r_median, g_median, b_median, 255])
        } else {
            Rgba([0, 0, 0, 255]) // Fallback to black
        };
        
        // Fill region with median color
        for py in y..y+height {
            for px in x..x+width {
                if px < img.width() && py < img.height() {
                    output.put_pixel(px, py, fill_color);
                }
            }
        }
        
        tracing::info!(
            "Inpainted text region at ({}, {}) size {}x{} with color {:?}",
            region.x, region.y, region.width, region.height, fill_color
        );
    }
    
    output
}

fn median_channel(pixels: &[Rgba<u8>], channel: usize) -> u8 {
    let mut values: Vec<u8> = pixels.iter().map(|p| p.0[channel]).collect();
    values.sort_unstable();
    values[values.len() / 2]
}

/// Detect common PHI patterns in text regions
pub fn filter_phi_regions(regions: Vec<TextRegion>) -> Vec<TextRegion> {
    // In production, this would use actual OCR text and pattern matching
    // For now, we keep all detected regions as potential PHI
    regions
}

/// Full OCR scrubbing pipeline
pub fn ocr_scrub_pipeline(
    img: DynamicImage,
    config: ScrubberConfig,
    use_inpainting: bool,
) -> Result<DynamicImage> {
    // 1. Detect text regions
    let regions = detect_text_regions_simple(&img, &config);
    
    if regions.is_empty() {
        tracing::debug!("No text regions detected in image");
        return Ok(img);
    }
    
    tracing::info!("Detected {} potential text regions", regions.len());
    
    // 2. Filter for PHI patterns
    let phi_regions = filter_phi_regions(regions);
    
    if phi_regions.is_empty() {
        tracing::debug!("No PHI regions after filtering");
        return Ok(img);
    }
    
    tracing::info!("Identified {} PHI regions to scrub", phi_regions.len());
    
    // 3. Scrub regions
    let scrubbed = if use_inpainting {
        scrub_with_inpainting(&img, &phi_regions, &config)
    } else {
        scrub_text_regions(&img, &phi_regions, &config)
    };
    
    Ok(scrubbed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::RgbaImage;
    
    #[test]
    fn test_detect_text_regions_empty() {
        let img = DynamicImage::ImageRgba8(RgbaImage::new(100, 100));
        let config = ScrubberConfig::default();
        let regions = detect_text_regions_simple(&img, &config);
        assert_eq!(regions.len(), 0);
    }
    
    #[test]
    fn test_regions_overlap() {
        let a = TextRegion {
            x: 10, y: 10, width: 50, height: 20,
            confidence: 0.8, text: "A".to_string(),
        };
        let b = TextRegion {
            x: 40, y: 15, width: 50, height: 20,
            confidence: 0.8, text: "B".to_string(),
        };
        assert!(regions_overlap(&a, &b));
    }
    
    #[test]
    fn test_merge_regions() {
        let a = TextRegion {
            x: 10, y: 10, width: 50, height: 20,
            confidence: 0.8, text: "A".to_string(),
        };
        let b = TextRegion {
            x: 40, y: 15, width: 50, height: 20,
            confidence: 0.9, text: "B".to_string(),
        };
        let merged = merge_regions(&a, &b);
        assert_eq!(merged.x, 10);
        assert_eq!(merged.y, 10);
        assert!(merged.width >= 80);
        assert_eq!(merged.confidence, 0.9);
    }
    
    #[test]
    fn test_scrub_pipeline() {
        let img = DynamicImage::ImageRgba8(RgbaImage::new(200, 200));
        let config = ScrubberConfig::default();
        let result = ocr_scrub_pipeline(img, config, false);
        assert!(result.is_ok());
    }
}
