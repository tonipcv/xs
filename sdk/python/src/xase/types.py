"""
Type definitions for XASE Sheets SDK
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any, List
from datetime import datetime


@dataclass
class Dataset:
    """Dataset object"""
    id: str
    name: str
    dataType: str
    size: int
    createdAt: str
    updatedAt: str
    tenantId: str
    description: Optional[str] = None
    recordCount: Optional[int] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class Lease:
    """Lease object"""
    id: str
    datasetId: str
    clientId: str
    startTime: str
    endTime: str
    status: str
    accessToken: str
    purpose: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class Policy:
    """Policy object"""
    id: str
    name: str
    datasetId: str
    rules: Dict[str, Any]
    active: bool
    createdAt: str
    updatedAt: str
    expiresAt: Optional[str] = None


@dataclass
class Usage:
    """Usage record"""
    id: str
    leaseId: str
    bytesTransferred: int
    recordsAccessed: int
    timestamp: str
    cost: Optional[float] = None


@dataclass
class Invoice:
    """Invoice object"""
    id: str
    tenantId: str
    amount: float
    currency: str
    status: str
    dueDate: str
    paidAt: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None


@dataclass
class Webhook:
    """Webhook object"""
    id: str
    url: str
    events: List[str]
    secret: str
    active: bool
    createdAt: str


@dataclass
class Offer:
    """Marketplace offer"""
    id: str
    datasetId: str
    price: float
    currency: str
    description: str
    terms: str
    active: bool
    dataset: Optional[Dataset] = None


@dataclass
class AccessRequest:
    """Access request"""
    id: str
    offerId: str
    requesterId: str
    purpose: str
    status: str
    createdAt: str
    respondedAt: Optional[str] = None


@dataclass
class Notification:
    """Notification object"""
    id: str
    type: str
    title: str
    message: str
    read: bool
    createdAt: str
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class AuditLog:
    """Audit log entry"""
    id: str
    action: str
    resourceType: str
    resourceId: str
    status: str
    timestamp: str
    userId: Optional[str] = None
    tenantId: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
