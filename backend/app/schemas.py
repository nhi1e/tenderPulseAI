from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class TenderAwardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tender_number: str
    source_url: str | None
    hospital: str
    region: str
    business_unit: str
    product_category: str
    product_description: str
    supplier_name: str
    manufacturer_group: str
    award_value_vnd: Decimal
    award_date: date
    valid_from: date | None
    valid_until: date | None
    match_confidence: Decimal | None


class SupplierPerformance(BaseModel):
    supplier: str
    awarded_value_vnd: Decimal
    share_percent: float


class DashboardOut(BaseModel):
    total_awarded_value_vnd: Decimal
    medtronic_awarded_value_vnd: Decimal
    medtronic_market_share_percent: float
    expiring_within_90_days: int
    supplier_performance: list[SupplierPerformance]
    upcoming_expirations: list[TenderAwardOut]

