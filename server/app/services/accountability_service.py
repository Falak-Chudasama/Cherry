"""
Accountability and Ledger service for Cherry.
Enforces Quarter Keys, deterministic Junk Point limits, and transparent violation audits.
"""
import uuid
from datetime import datetime
from typing import List, Optional, Tuple, Dict, Any
from app.core.database import get_db
from app.core.config import settings
from app.models.accountability_models import (
    QuarterKeyLedgerModel,
    JunkPointEntryModel,
    ViolationRecordModel,
    ViolationType,
)


class AccountabilityService:
    @property
    def db(self):
        return get_db()

    # --- Quarter Keys ---

    async def get_quarter_keys_balance(self, quarter_id: str) -> int:
        quarter = await self.db.quarters.find_one({"quarter_id": quarter_id})
        if quarter:
            return quarter.get("remaining_keys", settings.QUARTER_KEYS_INITIAL)
        return settings.QUARTER_KEYS_INITIAL

    async def spend_quarter_key(
        self,
        quarter_id: str,
        date_str: str,
        reason: str,
        violation_id: Optional[str] = None,
    ) -> QuarterKeyLedgerModel:
        """
        Record spending of 1 Quarter Key in the transparent ledger.
        Updates Quarter balance.
        """
        current_balance = await self.get_quarter_keys_balance(quarter_id)
        new_balance = max(0, current_balance - 1)

        # Update quarter document
        await self.db.quarters.update_one(
            {"quarter_id": quarter_id},
            {
                "$set": {"remaining_keys": new_balance},
                "$inc": {"total_violations": 1},
            },
        )

        tx = QuarterKeyLedgerModel(
            tx_id=str(uuid.uuid4()),
            quarter_id=quarter_id,
            date_str=date_str,
            delta=-1,
            balance_after=new_balance,
            reason=reason,
            violation_id=violation_id,
            timestamp=datetime.utcnow(),
        )
        await self.db.quarter_key_ledger.insert_one(tx.model_dump())
        return tx

    async def get_quarter_key_ledger(self, quarter_id: str) -> List[QuarterKeyLedgerModel]:
        cursor = self.db.quarter_key_ledger.find({"quarter_id": quarter_id}).sort("timestamp", -1)
        return [QuarterKeyLedgerModel(**doc) async for doc in cursor]

    # --- Junk Points (Bad Diet Table) ---

    async def add_junk_point_entry(
        self,
        date_str: str,
        quarter_id: str,
        food_item: str,
        base_score: float,
        portion_factor: float = 1.0,
        adjustments: float = 0.0,
        notes: str = "",
    ) -> Tuple[JunkPointEntryModel, float, bool]:
        """
        Deterministic calculation: (base_score * portion_factor) + adjustments.
        Enforces 50 JP limit deterministically.
        Returns: (entry, day_total_jp, did_exceed_limit).
        """
        calculated_points = round((base_score * portion_factor) + adjustments, 2)
        entry = JunkPointEntryModel(
            entry_id=str(uuid.uuid4()),
            date_str=date_str,
            quarter_id=quarter_id,
            food_item=food_item,
            base_score=base_score,
            portion_factor=portion_factor,
            adjustments=adjustments,
            calculated_points=calculated_points,
            notes=notes,
            timestamp=datetime.utcnow(),
        )
        await self.db.junk_point_ledger.insert_one(entry.model_dump())

        # Calculate current total for this date
        cursor = self.db.junk_point_ledger.find({"date_str": date_str})
        total_jp = 0.0
        async for doc in cursor:
            total_jp += doc.get("calculated_points", 0.0)

        total_jp = round(total_jp, 2)
        did_exceed = total_jp > settings.JUNK_POINT_LIMIT

        if did_exceed:
            # Check if violation already recorded for today's limit breach
            existing_violation = await self.db.violations.find_one(
                {"date_str": date_str, "rule_name": "exceeded_junk_point_limit"}
            )
            if not existing_violation:
                # Confirmed violation for exceeding 50 JP limit
                await self.record_violation(
                    quarter_id=quarter_id,
                    date_str=date_str,
                    rule_name="exceeded_junk_point_limit",
                    violation_type="confirmed",
                    evidence=f"Daily Junk Points ({total_jp} JP) exceeded limit ({settings.JUNK_POINT_LIMIT} JP).",
                    confirm_and_spend_key=True,
                )

        return entry, total_jp, did_exceed

    async def get_junk_points_for_day(self, date_str: str) -> List[JunkPointEntryModel]:
        cursor = self.db.junk_point_ledger.find({"date_str": date_str}).sort("timestamp", -1)
        return [JunkPointEntryModel(**doc) async for doc in cursor]

    async def get_daily_junk_points_total(self, date_str: str) -> float:
        cursor = self.db.junk_point_ledger.find({"date_str": date_str})
        total = 0.0
        async for doc in cursor:
            total += doc.get("calculated_points", 0.0)
        return round(total, 2)

    # --- Violations ---

    async def record_violation(
        self,
        quarter_id: str,
        date_str: str,
        rule_name: str,
        violation_type: ViolationType,
        evidence: str,
        confirm_and_spend_key: bool = False,
    ) -> ViolationRecordModel:
        violation_id = str(uuid.uuid4())
        is_confirmed = (violation_type == "confirmed") or confirm_and_spend_key
        key_spent = False

        if is_confirmed and confirm_and_spend_key:
            await self.spend_quarter_key(
                quarter_id=quarter_id,
                date_str=date_str,
                reason=f"Violation of rule: {rule_name}. Evidence: {evidence}",
                violation_id=violation_id,
            )
            key_spent = True

        violation = ViolationRecordModel(
            violation_id=violation_id,
            quarter_id=quarter_id,
            date_str=date_str,
            rule_name=rule_name,
            violation_type=violation_type,
            is_confirmed=is_confirmed,
            evidence=evidence,
            quarter_key_spent=key_spent,
            confirmed_at=datetime.utcnow() if is_confirmed else None,
        )
        await self.db.violations.insert_one(violation.model_dump())
        return violation

    async def get_quarter_violations(self, quarter_id: str) -> List[ViolationRecordModel]:
        cursor = self.db.violations.find({"quarter_id": quarter_id}).sort("created_at", -1)
        return [ViolationRecordModel(**doc) async for doc in cursor]


accountability_service = AccountabilityService()
