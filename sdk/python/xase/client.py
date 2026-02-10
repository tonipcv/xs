"""
Xase Client - Main SDK interface for federated queries
"""

import requests
from typing import Dict, List, Optional, Any
from .exceptions import AuthenticationError, PolicyViolationError, QueryError, XaseError


class XaseClient:
    """
    Xase SDK Client for federated data access
    
    Example:
        >>> client = XaseClient(api_key="your-api-key")
        >>> results = client.query(
        ...     data_source="postgres.xase.internal",
        ...     query="SELECT * FROM users WHERE age > 18"
        ... )
    """
    
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.xase.ai",
        federated_agent_url: Optional[str] = None,
        timeout: int = 30
    ):
        """
        Initialize Xase client
        
        Args:
            api_key: Xase API key
            base_url: Base URL for Xase API (default: https://api.xase.ai)
            federated_agent_url: URL for federated agent (optional)
            timeout: Request timeout in seconds (default: 30)
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.federated_agent_url = federated_agent_url or f"{self.base_url}/federated"
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json",
            "User-Agent": f"xase-python-sdk/{__import__('xase').__version__}"
        })
    
    def query(
        self,
        data_source: str,
        query: str,
        params: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute a federated query
        
        Args:
            data_source: Data source identifier (e.g., "postgres.xase.internal")
            query: SQL query to execute
            params: Optional query parameters
            
        Returns:
            List of result rows as dictionaries
            
        Raises:
            AuthenticationError: If API key is invalid
            PolicyViolationError: If query violates policy
            QueryError: If query execution fails
        """
        endpoint = f"{self.federated_agent_url}/query"
        
        payload = {
            "dataSource": data_source,
            "query": query
        }
        
        if params:
            payload["params"] = params
        
        try:
            response = self.session.post(
                endpoint,
                json=payload,
                timeout=self.timeout
            )
            
            if response.status_code == 401:
                raise AuthenticationError("Invalid API key")
            
            if response.status_code == 403:
                error_data = response.json()
                raise PolicyViolationError(
                    error_data.get("error", "Policy violation"),
                    details=error_data.get("details")
                )
            
            if response.status_code >= 400:
                error_data = response.json()
                raise QueryError(
                    error_data.get("error", "Query failed"),
                    details=error_data.get("details")
                )
            
            response.raise_for_status()
            data = response.json()
            
            return data.get("results", [])
            
        except requests.exceptions.Timeout:
            raise QueryError(f"Query timeout after {self.timeout}s")
        except requests.exceptions.RequestException as e:
            raise XaseError(f"Request failed: {str(e)}")
    
    def list_datasets(
        self,
        tenant_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        List available datasets
        
        Args:
            tenant_id: Filter by tenant ID (optional)
            limit: Maximum number of results (default: 50)
            offset: Offset for pagination (default: 0)
            
        Returns:
            Dictionary with datasets and pagination info
        """
        endpoint = f"{self.base_url}/api/v1/datasets"
        
        params = {
            "limit": limit,
            "offset": offset
        }
        
        if tenant_id:
            params["tenantId"] = tenant_id
        
        try:
            response = self.session.get(
                endpoint,
                params=params,
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            raise XaseError(f"Failed to list datasets: {str(e)}")
    
    def create_lease(
        self,
        dataset_id: str,
        purpose: str,
        duration: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create an access lease for a dataset
        
        Args:
            dataset_id: Dataset ID
            purpose: Purpose of access (TRAINING, INFERENCE, ANALYTICS)
            duration: Lease duration in seconds (optional)
            
        Returns:
            Lease information
        """
        endpoint = f"{self.base_url}/api/v1/leases"
        
        payload = {
            "datasetId": dataset_id,
            "purpose": purpose
        }
        
        if duration:
            payload["duration"] = duration
        
        try:
            response = self.session.post(
                endpoint,
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            raise XaseError(f"Failed to create lease: {str(e)}")
    
    def validate_policy(self, policy_yaml: str) -> Dict[str, Any]:
        """
        Validate a policy YAML
        
        Args:
            policy_yaml: Policy in YAML format
            
        Returns:
            Validation result
        """
        endpoint = f"{self.base_url}/api/v1/policies/validate"
        
        try:
            response = self.session.post(
                endpoint,
                data=policy_yaml,
                headers={"Content-Type": "text/plain"},
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            raise XaseError(f"Failed to validate policy: {str(e)}")
    
    def analyze_privacy(
        self,
        dataset_id: str,
        quasi_identifiers: Optional[List[str]] = None,
        k: int = 5
    ) -> Dict[str, Any]:
        """
        Analyze privacy of a dataset
        
        Args:
            dataset_id: Dataset ID
            quasi_identifiers: List of quasi-identifier columns (optional)
            k: K-anonymity threshold (default: 5)
            
        Returns:
            Privacy analysis results
        """
        endpoint = f"{self.base_url}/api/v1/privacy/analyze"
        
        payload = {
            "datasetId": dataset_id,
            "k": k
        }
        
        if quasi_identifiers:
            payload["quasiIdentifiers"] = quasi_identifiers
        
        try:
            response = self.session.post(
                endpoint,
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            raise XaseError(f"Failed to analyze privacy: {str(e)}")
    
    def detect_pii(self, data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Detect PII in data
        
        Args:
            data: List of data records
            
        Returns:
            PII detection results
        """
        endpoint = f"{self.base_url}/api/v1/privacy/pii-detect"
        
        payload = {"data": data}
        
        try:
            response = self.session.post(
                endpoint,
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            raise XaseError(f"Failed to detect PII: {str(e)}")
    
    def query_audit_logs(
        self,
        tenant_id: str,
        event_type: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Query audit logs
        
        Args:
            tenant_id: Tenant ID
            event_type: Event type filter (audit, policy_decision, data_access, consent)
            start_date: Start date (ISO format)
            end_date: End date (ISO format)
            limit: Maximum number of results (default: 100)
            offset: Offset for pagination (default: 0)
            
        Returns:
            Audit log events and pagination info
        """
        endpoint = f"{self.base_url}/api/v1/audit/query"
        
        payload = {
            "tenantId": tenant_id,
            "limit": limit,
            "offset": offset
        }
        
        if event_type:
            payload["eventType"] = event_type
        if start_date:
            payload["startDate"] = start_date
        if end_date:
            payload["endDate"] = end_date
        
        try:
            response = self.session.post(
                endpoint,
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            raise XaseError(f"Failed to query audit logs: {str(e)}")
    
    def close(self):
        """Close the HTTP session"""
        self.session.close()
    
    def __enter__(self):
        """Context manager entry"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()
