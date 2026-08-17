import os
from contextlib import asynccontextmanager
from datetime import date, timedelta
from decimal import Decimal

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from .models import Base, TenderAward
from .schemas import DashboardOut, SupplierPerformance, TenderAwardOut


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://tenderpulse:tenderpulse@localhost:5432/tenderpulse",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


DEMO_ROWS = [
    {
        "tender_number": "TP-26041",
        "hospital": "Bạch Mai Hospital",
        "region": "North",
        "business_unit": "NV",
        "product_category": "Neurovascular",
        "product_description": "Embolization and neurovascular devices",
        "supplier_name": "Demo Medical Distributor A",
        "manufacturer_group": "Competitor A",
        "award_value_vnd": Decimal("3400000000"),
        "award_date": date(2026, 4, 18),
        "valid_from": date(2026, 4, 20),
        "valid_until": date(2026, 9, 6),
        "match_confidence": Decimal("0.94"),
    },
    {
        "tender_number": "TP-26042",
        "hospital": "Chợ Rẫy Hospital",
        "region": "South",
        "business_unit": "CST",
        "product_category": "Cardiac surgery",
        "product_description": "Cardiac surgery supplies",
        "supplier_name": "Demo Healthcare Trading Co.",
        "manufacturer_group": "Competitor A",
        "award_value_vnd": Decimal("4100000000"),
        "award_date": date(2026, 5, 3),
        "valid_from": date(2026, 5, 10),
        "valid_until": date(2026, 9, 18),
        "match_confidence": Decimal("0.91"),
    },
    {
        "tender_number": "TP-26043",
        "hospital": "108 Military Central Hospital",
        "region": "North",
        "business_unit": "CST",
        "product_category": "Surgical instruments",
        "product_description": "Reusable surgical instruments",
        "supplier_name": "Demo Medtronic Distributor",
        "manufacturer_group": "Medtronic",
        "award_value_vnd": Decimal("3200000000"),
        "award_date": date(2026, 5, 22),
        "valid_from": date(2026, 6, 1),
        "valid_until": date(2026, 10, 29),
        "match_confidence": Decimal("0.98"),
    },
    {
        "tender_number": "TP-26046",
        "hospital": "Huế Central Hospital",
        "region": "Central",
        "business_unit": "SI",
        "product_category": "Laparoscopic instruments",
        "product_description": "Laparoscopic surgical instruments",
        "supplier_name": "Demo Medtronic Distributor",
        "manufacturer_group": "Medtronic",
        "award_value_vnd": Decimal("4400000000"),
        "award_date": date(2026, 6, 12),
        "valid_from": date(2026, 6, 16),
        "valid_until": date(2026, 10, 16),
        "match_confidence": Decimal("0.96"),
    },
]


def get_db():
    with SessionLocal() as session:
        yield session


def seed_demo_data() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        existing = session.scalar(select(TenderAward.id).limit(1))
        if existing is None:
            session.add_all(TenderAward(**row) for row in DEMO_ROWS)
            session.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    seed_demo_data()
    yield


app = FastAPI(
    title="TenderPulse AI API",
    version="0.1.0",
    description="Demo API for structured public tender award intelligence.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/tenders", response_model=list[TenderAwardOut])
def list_tenders(
    region: str | None = None,
    business_unit: str | None = None,
    supplier: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    statement = select(TenderAward).order_by(TenderAward.award_date.desc()).limit(limit)
    if region:
        statement = statement.where(TenderAward.region == region)
    if business_unit:
        statement = statement.where(TenderAward.business_unit == business_unit)
    if supplier:
        statement = statement.where(TenderAward.manufacturer_group == supplier)
    return list(db.scalars(statement))


@app.get("/api/dashboard", response_model=DashboardOut)
def dashboard(
    as_of: date = Query(default=date(2026, 8, 17)),
    region: str | None = None,
    business_unit: str | None = None,
    db: Session = Depends(get_db),
):
    statement = select(TenderAward)
    if region:
        statement = statement.where(TenderAward.region == region)
    if business_unit:
        statement = statement.where(TenderAward.business_unit == business_unit)
    rows = list(db.scalars(statement))

    total = sum((row.award_value_vnd for row in rows), Decimal("0"))
    medtronic = sum((row.award_value_vnd for row in rows if row.manufacturer_group == "Medtronic"), Decimal("0"))
    cutoff = as_of + timedelta(days=90)
    upcoming = [row for row in rows if row.valid_until and as_of <= row.valid_until <= cutoff]

    groups: dict[str, Decimal] = {}
    for row in rows:
        groups[row.manufacturer_group] = groups.get(row.manufacturer_group, Decimal("0")) + row.award_value_vnd

    performance = [
        SupplierPerformance(
            supplier=name,
            awarded_value_vnd=value,
            share_percent=round(float(value / total * 100), 1) if total else 0,
        )
        for name, value in sorted(groups.items(), key=lambda item: item[1], reverse=True)
    ]

    return DashboardOut(
        total_awarded_value_vnd=total,
        medtronic_awarded_value_vnd=medtronic,
        medtronic_market_share_percent=round(float(medtronic / total * 100), 1) if total else 0,
        expiring_within_90_days=len(upcoming),
        supplier_performance=performance,
        upcoming_expirations=upcoming,
    )

