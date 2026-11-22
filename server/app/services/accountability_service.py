"""
Accountability and Ledger service for Cherry.
Enforces Personal Rules, Violations, Diet & Junk Points (50 JP daily limit),
and Quarter Keys without invented operational deductions.
"""
import uuid
import logging
from datetime import datetime
from typing import List, Optional, Tuple, Dict, Any
from app.core.database import get_db
from app.core.config import settings
from app.models.accountability_models import (
    RuleModel,
    ViolationRecordModel,
    JunkPointEntryModel,
    FoodJpMappingModel,
    QuarterKeyLedgerModel,
    JunkPointSummary,
)

logger = logging.getLogger(__name__)

DEFAULT_RULES = [
    {
        "rule_id": "no_games",
        "name": "No Games",
        "description": "Zero unauthorized gaming during work and focus hours.",
        "is_active": True,
    },
    {
        "rule_id": "junk_point_limit",
        "name": "Junk Point Limit (50 JP)",
        "description": "Daily junk food intake must not exceed the strict 50 JP threshold.",
        "is_active": True,
    },
    {
        "rule_id": "no_skip_all_routines",
        "name": "Do Not Skip All Routines",
        "description": "Never skip all scheduled routine tasks on any given active day.",
        "is_active": True,
    },
]


class AccountabilityService:
    @property
    def db(self):
        return get_db()

    async def init_default_rules(self):
        """Ensure standard rules exist idempotently."""
        for r in DEFAULT_RULES:
            await self.db.rules.update_one(
                {"rule_id": r["rule_id"]},
                {"$setOnInsert": r},
                upsert=True,
            )

    # --- Rules ---

    async def get_rules(self) -> List[RuleModel]:
        cursor = self.db.rules.find({"is_active": True})
        rules = [RuleModel(**doc) async for doc in cursor]
        if not rules:
            await self.init_default_rules()
            cursor = self.db.rules.find({"is_active": True})
            rules = [RuleModel(**doc) async for doc in cursor]
        return rules

    # --- Violations ---

    async def record_violation(
        self,
        rule_id: str,
        date_str: str,
        period_id: str,
        evidence: str,
        rule_name: Optional[str] = None,
        notes: str = "",
    ) -> ViolationRecordModel:
        if not rule_name:
            rule_doc = await self.db.rules.find_one({"rule_id": rule_id})
            rule_name = rule_doc["name"] if rule_doc else rule_id

        violation = ViolationRecordModel(
            violation_id=str(uuid.uuid4()),
            rule_id=rule_id,
            rule_name=rule_name,
            date_str=date_str,
            period_id=period_id,
            evidence=evidence,
            notes=notes,
            is_confirmed=True,
            timestamp=datetime.utcnow(),
        )
        await self.db.violations.insert_one(violation.model_dump())
        logger.info(f"Recorded violation {violation.violation_id} for rule {rule_id} on {date_str}.")
        return violation

    async def get_period_violations(self, period_id: str) -> List[ViolationRecordModel]:
        cursor = self.db.violations.find({
            "$or": [{"period_id": period_id}, {"quarter_id": period_id}]
        }).sort("timestamp", -1)
        return [ViolationRecordModel(**doc) async for doc in cursor]

    async def get_quarter_violations(self, quarter_id: str) -> List[ViolationRecordModel]:
        return await self.get_period_violations(quarter_id)

    async def get_day_violations(self, date_str: str) -> List[ViolationRecordModel]:
        cursor = self.db.violations.find({"date_str": date_str}).sort("timestamp", -1)
        return [ViolationRecordModel(**doc) async for doc in cursor]

    async def delete_violation(self, violation_id: str) -> bool:
        res = await self.db.violations.delete_one({"violation_id": violation_id})
        return res.deleted_count > 0

    async def update_violation(self, violation_id: str, updates: Dict[str, Any]) -> Optional[ViolationRecordModel]:
        res = await self.db.violations.find_one_and_update(
            {"violation_id": violation_id},
            {"$set": updates},
            return_document=True,
        )
        return ViolationRecordModel(**res) if res else None

    # --- Diet & Junk Points (Bad Diet Table) ---

    async def add_junk_point_entry(
        self,
        date_str: str,
        period_id: str,
        food_item: str,
        jp_value: float,
        notes: str = "",
    ) -> Tuple[JunkPointEntryModel, JunkPointSummary]:
        """
        Record explicit user-entered or mapped JP value.
        Deterministically computes remaining_jp = 50 - accumulated_jp.
        Evaluates junk_point_limit violation without auto-deducting Quarter Keys.
        """
        entry = JunkPointEntryModel(
            entry_id=str(uuid.uuid4()),
            date_str=date_str,
            period_id=period_id,
            food_item=food_item,
            jp_value=round(float(jp_value), 2),
            notes=notes,
            timestamp=datetime.utcnow(),
        )
        await self.db.junk_point_ledger.insert_one(entry.model_dump())

        # Check day summary
        day_summary = await self.get_day_junk_points(date_str, period_id)

        # Check violation if exceeded
        if day_summary.accumulated_jp > settings.JUNK_POINT_LIMIT:
            existing_viol = await self.db.violations.find_one({
                "date_str": date_str,
                "rule_id": "junk_point_limit",
            })
            if not existing_viol:
                await self.record_violation(
                    rule_id="junk_point_limit",
                    rule_name="Junk Point Limit (50 JP)",
                    date_str=date_str,
                    period_id=period_id,
                    evidence=f"Daily accumulated Junk Points ({day_summary.accumulated_jp} JP) exceeded limit of {settings.JUNK_POINT_LIMIT} JP.",
                )

        return entry, day_summary

    async def get_day_junk_points(self, date_str: str, period_id: Optional[str] = None) -> JunkPointSummary:
        cursor = self.db.junk_point_ledger.find({"date_str": date_str}).sort("timestamp", 1)
        entries = [JunkPointEntryModel(**doc) async for doc in cursor]
        accumulated = round(sum(e.jp_value for e in entries), 2)
        remaining = round(max(0.0, float(settings.JUNK_POINT_LIMIT) - accumulated), 2)

        return JunkPointSummary(
            scope="day",
            identifier=date_str,
            limit=float(settings.JUNK_POINT_LIMIT),
            accumulated_jp=accumulated,
            remaining_jp=remaining,
            entries=entries,
        )

    async def get_daily_junk_points_total(self, date_str: str) -> float:
        """Helper for lifecycle closure jobs and feedback summaries."""
        summary = await self.get_day_junk_points(date_str)
        return summary.accumulated_jp

    async def get_period_junk_points(self, period_id: str) -> JunkPointSummary:
        cursor = self.db.junk_point_ledger.find({
            "$or": [{"period_id": period_id}, {"quarter_id": period_id}]
        }).sort("timestamp", 1)
        entries = [JunkPointEntryModel(**doc) async for doc in cursor]
        accumulated = round(sum(e.jp_value for e in entries), 2)

        return JunkPointSummary(
            scope="period",
            identifier=period_id,
            limit=float(settings.JUNK_POINT_LIMIT),
            accumulated_jp=accumulated,
            remaining_jp=0.0,
            entries=entries,
        )

    async def update_junk_point_entry(self, entry_id: str, updates: Dict[str, Any]) -> Optional[JunkPointEntryModel]:
        if "jp_value" in updates:
            updates["jp_value"] = round(float(updates["jp_value"]), 2)
        res = await self.db.junk_point_ledger.find_one_and_update(
            {"entry_id": entry_id},
            {"$set": updates},
            return_document=True,
        )
        return JunkPointEntryModel(**res) if res else None

    async def delete_junk_point_entry(self, entry_id: str) -> bool:
        res = await self.db.junk_point_ledger.delete_one({"entry_id": entry_id})
        return res.deleted_count > 0

    # --- User-Managed Food JP Mappings ---

    async def get_food_mappings(self) -> List[FoodJpMappingModel]:
        cursor = self.db.food_jp_mappings.find().sort("food_name", 1)
        return [FoodJpMappingModel(**doc) async for doc in cursor]

    async def set_food_mapping(self, food_name: str, default_jp: float, notes: str = "") -> FoodJpMappingModel:
        mapping = FoodJpMappingModel(
            food_name=food_name.strip(),
            default_jp=round(float(default_jp), 2),
            notes=notes,
        )
        await self.db.food_jp_mappings.update_one(
            {"food_name": mapping.food_name},
            {"$set": mapping.model_dump()},
            upsert=True,
        )
        return mapping

    async def delete_food_mapping(self, mapping_id: str) -> bool:
        res = await self.db.food_jp_mappings.delete_one({"mapping_id": mapping_id})
        return res.deleted_count > 0

    # --- Quarter Keys (Preserved Constants, Explicit Management) ---

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
        current_balance = await self.get_quarter_keys_balance(quarter_id)
        new_balance = max(0, current_balance - 1)

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


accountability_service = AccountabilityService()
