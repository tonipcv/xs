"""
Helper utilities for rewrite rules and k-anonymity validation
"""

from typing import List, Dict, Any, Optional, Set
from collections import Counter


class RewriteRulesHelper:
    """Helper for working with policy rewrite rules"""
    
    def __init__(
        self,
        allowed_columns: Optional[List[str]] = None,
        denied_columns: Optional[List[str]] = None,
        row_filters: Optional[Dict[str, Any]] = None,
        masking_rules: Optional[Dict[str, str]] = None,
    ):
        """
        Initialize rewrite rules helper
        
        Args:
            allowed_columns: List of allowed column names
            denied_columns: List of denied column names
            row_filters: Dictionary of row filter conditions
            masking_rules: Dictionary of masking rules per column
        """
        self.allowed_columns = set(allowed_columns or [])
        self.denied_columns = set(denied_columns or [])
        self.row_filters = row_filters or {}
        self.masking_rules = masking_rules or {}
    
    def filter_columns(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Filter columns based on allowed/denied lists
        
        Args:
            data: Dictionary of column data
            
        Returns:
            Filtered dictionary
        """
        result = {}
        
        for key, value in data.items():
            # If allowed_columns is set, only include those
            if self.allowed_columns and key not in self.allowed_columns:
                continue
            
            # Skip denied columns
            if key in self.denied_columns:
                continue
            
            result[key] = value
        
        return result
    
    def apply_masking(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Apply masking rules to data
        
        Args:
            data: Dictionary of column data
            
        Returns:
            Masked dictionary
        """
        result = data.copy()
        
        for column, mask_type in self.masking_rules.items():
            if column not in result:
                continue
            
            value = result[column]
            
            if mask_type == 'hash':
                # Simple hash masking
                result[column] = f"***{hash(str(value)) % 10000}***"
            elif mask_type == 'redact':
                result[column] = "***REDACTED***"
            elif mask_type == 'partial':
                # Show first and last 2 chars
                if isinstance(value, str) and len(value) > 4:
                    result[column] = f"{value[:2]}***{value[-2:]}"
                else:
                    result[column] = "***"
        
        return result
    
    def apply_row_filters(self, data: Dict[str, Any]) -> bool:
        """
        Check if row passes filter conditions
        
        Args:
            data: Dictionary of column data
            
        Returns:
            True if row should be included, False otherwise
        """
        if not self.row_filters:
            return True
        
        for column, condition in self.row_filters.items():
            if column not in data:
                return False
            
            value = data[column]
            
            # Simple equality check
            if isinstance(condition, dict):
                if 'equals' in condition and value != condition['equals']:
                    return False
                if 'not_equals' in condition and value == condition['not_equals']:
                    return False
                if 'in' in condition and value not in condition['in']:
                    return False
            else:
                # Direct equality
                if value != condition:
                    return False
        
        return True
    
    def process_row(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Apply all rewrite rules to a row
        
        Args:
            data: Dictionary of column data
            
        Returns:
            Processed row or None if filtered out
        """
        # Check row filters first
        if not self.apply_row_filters(data):
            return None
        
        # Filter columns
        result = self.filter_columns(data)
        
        # Apply masking
        result = self.apply_masking(result)
        
        return result


class KAnonymityValidator:
    """Helper for validating k-anonymity constraints"""
    
    def __init__(self, k_min: int = 5):
        """
        Initialize k-anonymity validator
        
        Args:
            k_min: Minimum k value for anonymity
        """
        self.k_min = k_min
    
    def check_k_anonymity(
        self,
        data: List[Dict[str, Any]],
        quasi_identifiers: List[str],
    ) -> Dict[str, Any]:
        """
        Check if dataset satisfies k-anonymity
        
        Args:
            data: List of data records
            quasi_identifiers: List of quasi-identifier column names
            
        Returns:
            Dictionary with validation results
        """
        if not data:
            return {
                'valid': True,
                'k_value': float('inf'),
                'violations': [],
            }
        
        # Group records by quasi-identifier combinations
        groups = {}
        
        for idx, record in enumerate(data):
            # Extract quasi-identifier values
            qi_values = tuple(
                record.get(qi, None) for qi in quasi_identifiers
            )
            
            if qi_values not in groups:
                groups[qi_values] = []
            groups[qi_values].append(idx)
        
        # Find minimum group size
        min_group_size = min(len(group) for group in groups.values())
        
        # Find violations (groups smaller than k_min)
        violations = []
        for qi_values, indices in groups.items():
            if len(indices) < self.k_min:
                violations.append({
                    'quasi_identifiers': dict(zip(quasi_identifiers, qi_values)),
                    'count': len(indices),
                    'required': self.k_min,
                })
        
        return {
            'valid': min_group_size >= self.k_min,
            'k_value': min_group_size,
            'total_groups': len(groups),
            'violations': violations,
            'violation_count': len(violations),
        }
    
    def suggest_suppression(
        self,
        data: List[Dict[str, Any]],
        quasi_identifiers: List[str],
    ) -> List[int]:
        """
        Suggest which records to suppress to achieve k-anonymity
        
        Args:
            data: List of data records
            quasi_identifiers: List of quasi-identifier column names
            
        Returns:
            List of indices to suppress
        """
        # Group records
        groups = {}
        for idx, record in enumerate(data):
            qi_values = tuple(
                record.get(qi, None) for qi in quasi_identifiers
            )
            if qi_values not in groups:
                groups[qi_values] = []
            groups[qi_values].append(idx)
        
        # Find records in groups smaller than k_min
        to_suppress = []
        for group in groups.values():
            if len(group) < self.k_min:
                to_suppress.extend(group)
        
        return sorted(to_suppress)
    
    def generalize_values(
        self,
        data: List[Dict[str, Any]],
        column: str,
        generalization_map: Dict[Any, Any],
    ) -> List[Dict[str, Any]]:
        """
        Apply generalization to a column
        
        Args:
            data: List of data records
            column: Column name to generalize
            generalization_map: Mapping of specific values to general values
            
        Returns:
            Generalized data
        """
        result = []
        for record in data:
            new_record = record.copy()
            if column in new_record:
                value = new_record[column]
                new_record[column] = generalization_map.get(value, value)
            result.append(new_record)
        
        return result


def validate_query_columns(
    query_columns: List[str],
    allowed_columns: Optional[List[str]] = None,
    denied_columns: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Validate query columns against policy rules
    
    Args:
        query_columns: Columns requested in query
        allowed_columns: Allowed columns from policy
        denied_columns: Denied columns from policy
        
    Returns:
        Validation result dictionary
    """
    violations = []
    
    # Check against allowed list
    if allowed_columns:
        for col in query_columns:
            if col not in allowed_columns:
                violations.append({
                    'column': col,
                    'reason': 'not in allowed list',
                })
    
    # Check against denied list
    if denied_columns:
        for col in query_columns:
            if col in denied_columns:
                violations.append({
                    'column': col,
                    'reason': 'in denied list',
                })
    
    return {
        'valid': len(violations) == 0,
        'violations': violations,
    }
