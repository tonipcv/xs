"""
Differential Privacy client for local epsilon calculations
"""

import numpy as np
from typing import List, Dict, Any, Optional, Callable
from enum import Enum


class DPMechanism(Enum):
    """Differential privacy mechanisms"""
    LAPLACE = "laplace"
    GAUSSIAN = "gaussian"
    EXPONENTIAL = "exponential"


class DPClient:
    """Client for differential privacy calculations"""
    
    def __init__(self, epsilon: float = 1.0, delta: float = 1e-5):
        """
        Initialize DP client
        
        Args:
            epsilon: Privacy budget (smaller = more private)
            delta: Failure probability for (ε,δ)-DP
        """
        self.epsilon = epsilon
        self.delta = delta
        self.consumed_epsilon = 0.0
    
    def add_laplace_noise(
        self,
        value: float,
        sensitivity: float,
        epsilon: Optional[float] = None,
    ) -> float:
        """
        Add Laplace noise for differential privacy
        
        Args:
            value: True value
            sensitivity: Global sensitivity of the query
            epsilon: Privacy budget for this query (uses default if None)
            
        Returns:
            Noisy value
        """
        eps = epsilon or self.epsilon
        scale = sensitivity / eps
        noise = np.random.laplace(0, scale)
        
        # Track epsilon consumption
        self.consumed_epsilon += eps
        
        return value + noise
    
    def add_gaussian_noise(
        self,
        value: float,
        sensitivity: float,
        epsilon: Optional[float] = None,
        delta: Optional[float] = None,
    ) -> float:
        """
        Add Gaussian noise for (ε,δ)-differential privacy
        
        Args:
            value: True value
            sensitivity: Global sensitivity of the query
            epsilon: Privacy budget for this query
            delta: Failure probability
            
        Returns:
            Noisy value
        """
        eps = epsilon or self.epsilon
        dlt = delta or self.delta
        
        # Calculate sigma for (ε,δ)-DP
        sigma = sensitivity * np.sqrt(2 * np.log(1.25 / dlt)) / eps
        noise = np.random.normal(0, sigma)
        
        # Track epsilon consumption
        self.consumed_epsilon += eps
        
        return value + noise
    
    def count_query(
        self,
        data: List[Any],
        condition: Optional[Callable[[Any], bool]] = None,
        mechanism: DPMechanism = DPMechanism.LAPLACE,
    ) -> float:
        """
        Execute a differentially private count query
        
        Args:
            data: List of data records
            condition: Optional filter condition
            mechanism: DP mechanism to use
            
        Returns:
            Noisy count
        """
        # True count
        if condition:
            true_count = sum(1 for item in data if condition(item))
        else:
            true_count = len(data)
        
        # Sensitivity of count is 1 (adding/removing one record changes count by 1)
        sensitivity = 1.0
        
        if mechanism == DPMechanism.LAPLACE:
            return self.add_laplace_noise(true_count, sensitivity)
        elif mechanism == DPMechanism.GAUSSIAN:
            return self.add_gaussian_noise(true_count, sensitivity)
        else:
            raise ValueError(f"Unsupported mechanism: {mechanism}")
    
    def sum_query(
        self,
        data: List[Dict[str, Any]],
        column: str,
        max_value: float,
        mechanism: DPMechanism = DPMechanism.LAPLACE,
    ) -> float:
        """
        Execute a differentially private sum query
        
        Args:
            data: List of data records
            column: Column to sum
            max_value: Maximum value for clipping (sensitivity)
            mechanism: DP mechanism to use
            
        Returns:
            Noisy sum
        """
        # True sum with clipping
        true_sum = sum(
            min(max_value, max(0, record.get(column, 0)))
            for record in data
        )
        
        # Sensitivity is max_value (one record can contribute at most max_value)
        sensitivity = max_value
        
        if mechanism == DPMechanism.LAPLACE:
            return self.add_laplace_noise(true_sum, sensitivity)
        elif mechanism == DPMechanism.GAUSSIAN:
            return self.add_gaussian_noise(true_sum, sensitivity)
        else:
            raise ValueError(f"Unsupported mechanism: {mechanism}")
    
    def mean_query(
        self,
        data: List[Dict[str, Any]],
        column: str,
        max_value: float,
        mechanism: DPMechanism = DPMechanism.LAPLACE,
    ) -> float:
        """
        Execute a differentially private mean query
        
        Args:
            data: List of data records
            column: Column to average
            max_value: Maximum value for clipping
            mechanism: DP mechanism to use
            
        Returns:
            Noisy mean
        """
        # Use composition: noisy sum / noisy count
        noisy_sum = self.sum_query(data, column, max_value, mechanism)
        noisy_count = self.count_query(data, mechanism=mechanism)
        
        if noisy_count <= 0:
            return 0.0
        
        return noisy_sum / noisy_count
    
    def histogram_query(
        self,
        data: List[Dict[str, Any]],
        column: str,
        bins: List[Any],
        mechanism: DPMechanism = DPMechanism.LAPLACE,
    ) -> Dict[Any, float]:
        """
        Execute a differentially private histogram query
        
        Args:
            data: List of data records
            column: Column to histogram
            bins: List of bin values
            mechanism: DP mechanism to use
            
        Returns:
            Dictionary of bin -> noisy count
        """
        # True histogram
        true_hist = {bin_val: 0 for bin_val in bins}
        for record in data:
            value = record.get(column)
            if value in true_hist:
                true_hist[value] += 1
        
        # Add noise to each bin
        # Sensitivity is 1 (one record affects at most one bin)
        sensitivity = 1.0
        
        noisy_hist = {}
        for bin_val, count in true_hist.items():
            if mechanism == DPMechanism.LAPLACE:
                noisy_hist[bin_val] = self.add_laplace_noise(count, sensitivity)
            elif mechanism == DPMechanism.GAUSSIAN:
                noisy_hist[bin_val] = self.add_gaussian_noise(count, sensitivity)
            else:
                raise ValueError(f"Unsupported mechanism: {mechanism}")
        
        return noisy_hist
    
    def get_remaining_budget(self) -> float:
        """
        Get remaining privacy budget
        
        Returns:
            Remaining epsilon
        """
        return max(0.0, self.epsilon - self.consumed_epsilon)
    
    def reset_budget(self):
        """Reset consumed epsilon to 0"""
        self.consumed_epsilon = 0.0
    
    def estimate_query_cost(
        self,
        query_type: str,
        mechanism: DPMechanism = DPMechanism.LAPLACE,
    ) -> float:
        """
        Estimate epsilon cost for a query
        
        Args:
            query_type: Type of query (count, sum, mean, histogram)
            mechanism: DP mechanism to use
            
        Returns:
            Estimated epsilon cost
        """
        # Base cost is the configured epsilon
        base_cost = self.epsilon
        
        # Mean queries use composition (sum + count)
        if query_type == 'mean':
            return base_cost * 2
        
        return base_cost
    
    def can_execute_query(
        self,
        query_type: str,
        mechanism: DPMechanism = DPMechanism.LAPLACE,
    ) -> bool:
        """
        Check if query can be executed within budget
        
        Args:
            query_type: Type of query
            mechanism: DP mechanism to use
            
        Returns:
            True if query can be executed
        """
        cost = self.estimate_query_cost(query_type, mechanism)
        return self.get_remaining_budget() >= cost


class DPBudgetTracker:
    """Track differential privacy budget across multiple queries"""
    
    def __init__(self, total_budget: float = 1.0):
        """
        Initialize budget tracker
        
        Args:
            total_budget: Total epsilon budget
        """
        self.total_budget = total_budget
        self.queries: List[Dict[str, Any]] = []
    
    def record_query(
        self,
        query_type: str,
        epsilon_used: float,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """
        Record a query execution
        
        Args:
            query_type: Type of query executed
            epsilon_used: Epsilon consumed
            metadata: Optional query metadata
        """
        self.queries.append({
            'query_type': query_type,
            'epsilon_used': epsilon_used,
            'metadata': metadata or {},
            'timestamp': np.datetime64('now'),
        })
    
    def get_consumed_budget(self) -> float:
        """
        Get total consumed budget
        
        Returns:
            Total epsilon consumed
        """
        return sum(q['epsilon_used'] for q in self.queries)
    
    def get_remaining_budget(self) -> float:
        """
        Get remaining budget
        
        Returns:
            Remaining epsilon
        """
        return max(0.0, self.total_budget - self.get_consumed_budget())
    
    def get_query_history(self) -> List[Dict[str, Any]]:
        """
        Get query execution history
        
        Returns:
            List of query records
        """
        return self.queries.copy()
    
    def is_budget_exhausted(self, threshold: float = 0.0) -> bool:
        """
        Check if budget is exhausted
        
        Args:
            threshold: Minimum remaining budget threshold
            
        Returns:
            True if budget is exhausted
        """
        return self.get_remaining_budget() <= threshold
