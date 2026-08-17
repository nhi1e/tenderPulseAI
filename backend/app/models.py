from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Numeric, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TenderAward(Base):
    __tablename__ = "tender_awards"

    id: Mapped[int] = mapped_column(primary_key=True)
    tender_number: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    hospital: Mapped[str] = mapped_column(String(240), index=True)
    region: Mapped[str] = mapped_column(String(40), index=True)
    business_unit: Mapped[str] = mapped_column(String(40), index=True)
    product_category: Mapped[str] = mapped_column(String(160), index=True)
    product_description: Mapped[str] = mapped_column(Text)
    supplier_name: Mapped[str] = mapped_column(String(240), index=True)
    manufacturer_group: Mapped[str] = mapped_column(String(120), index=True)
    award_value_vnd: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    award_date: Mapped[date] = mapped_column(Date, index=True)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    match_confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

