-- The four members are paid up.
--
-- 0004 seeded them with paid_until NULL, which reads as "due from day one" —
-- true of a name typed into an empty database, and not true of these four.
-- This records the payment the club has actually taken.
--
-- The term runs from the day this is applied, which is what
-- `markMembershipPaid` in src/lib/players.ts would do if the desk had tapped
-- "take a payment" on each of them instead. The months per tier are spelled
-- out here rather than read from MEMBERSHIP_TIERS, because SQL cannot see it;
-- keep the two in step if the tiers change.
--
-- Coaches are skipped — they are on 'payg' and pay nothing — and so is anyone
-- who already has a paid-up date, so re-running this cannot quietly hand
-- somebody a second month.
UPDATE players
SET paid_until = current_date + CASE membership
    WHEN 'term' THEN INTERVAL '3 months'
    ELSE INTERVAL '1 month'
  END
WHERE active
  AND role = 'member'
  AND membership <> 'payg'
  AND paid_until IS NULL;
