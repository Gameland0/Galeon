# Galeon Prediction Season 1

## Final Incentive Plan

100,000,000 Points + Monthly USDC Rewards | 90 Days

*Public tagline: 90 Days. Trade. Predict. Compete. Earn your share.*

---

## 1. Overview

| Item | Detail |
|------|--------|
| Name | Galeon Prediction Season 1 |
| Duration | 90 days |
| Points Pool | 100,000,000 Points |
| USDC Rewards | Monthly, 50% of Reserve Pool balance, 3 distributions total |
| Eligible Product | Galeon Trade Prediction Market |
| Eligible Users | All users who participate in valid settled prediction pools during the season |

### Dual-Layer Incentive

- **Points:** Used to determine eligibility and allocation weight for future Galeon ecosystem rewards.
- **Monthly USDC Rewards:** Distributed from the Reserve Pool every month to reward real prediction activity and profit performance.

---

## 2. Points Allocation

| Category | Points | Share | Recipients | Distribution |
|----------|--------|-------|------------|-------------|
| Daily Participation | 80,000,000 | 80% | All valid users | Daily (888,889 pts/day) |
| Weekly Bonus | 10,000,000 | 10% | Top 20 per round | Weekly (13 rounds) |
| Accuracy Bonus | 10,000,000 | 10% | Top 200 | Season end |
| **Total** | **100,000,000** | **100%** | — | — |

---

## 3. Daily Participation — 80,000,000 Points

Every day, a fixed budget of **888,889 points** is distributed to all participants who had valid settled predictions that day. The daily budget is split proportionally based on each user's activity weight.

### 3.1 Daily Budget

```
Daily Budget = 80,000,000 / 90 days = 888,889 points per day
```

### 3.2 Weight Formula

Each settled prediction generates a weight:

```
Weight = 10 × Amount Multiplier
```

### 3.3 Amount Multiplier

| Prediction Amount | Multiplier |
|-------------------|------------|
| $1 – $9.99 | 1x |
| $10 – $49.99 | 1.5x |
| $50 – $99.99 | 2x |
| $100+ | 2.5x (max) |

### 3.4 Daily Distribution

At the end of each day (UTC 00:00), the system calculates each user's share:

```
User Daily Weight = Sum of all prediction weights that day
Total Daily Weight = Sum of all users' weights that day

User Daily Points = 888,889 × (User Daily Weight / Total Daily Weight)
```

### 3.5 Examples

Assume 3 users participate on a given day:

| User | Predictions | Amount Each | Weight per Bet | Total Weight | Share | Daily Points |
|------|-------------|-------------|---------------|-------------|-------|-------------|
| A | 5 | $50 | 10 × 2.0 = 20 | 100 | 29.0% | 257,681 |
| B | 3 | $20 | 10 × 1.5 = 15 | 45 | 13.0% | 115,956 |
| C | 8 | $100 | 10 × 2.5 = 25 | 200 | 58.0% | 515,252 |
| **Total** | | | | **345** | **100%** | **888,889** |

### 3.6 Key Properties

- The total daily distribution is always exactly **888,889 points** regardless of how many users participate
- More users participating = smaller individual share; fewer users = larger individual share
- Higher prediction amounts earn proportionally more weight
- No daily or season cap per user is needed since the total is fixed by the daily budget

---

## 4. Weekly Bonus — 10,000,000 Points

Weekly Bonus rewards the Top 20 users per round ranked by weekly points earned. Points earned from Daily Participation during that week determine the weekly ranking.

### 4.1 Pool Structure

| Round Type | Number of Rounds | Points per Round | Total |
|------------|-----------------|-----------------|-------|
| Weekly Round | 12 | 750,000 | 9,000,000 |
| Final Sprint Round | 1 | 1,000,000 | 1,000,000 |
| **Total** | **13 rounds** | — | **10,000,000** |

The first 84 days contain 12 full weekly rounds. The final 6 days are treated as a Final Sprint Round.

### 4.2 Weekly Round Reward Breakdown (750,000 pts)

| Rank | Points Each | Count | Subtotal |
|------|------------|-------|----------|
| #1 | 180,000 | 1 | 180,000 |
| #2 | 110,000 | 1 | 110,000 |
| #3 | 80,000 | 1 | 80,000 |
| #4 – #10 | 40,000 | 7 | 280,000 |
| #11 – #20 | 10,000 | 10 | 100,000 |
| **Total** | — | **20** | **750,000** |

### 4.3 Final Sprint Round Reward Breakdown (1,000,000 pts)

| Rank | Points Each | Count | Subtotal |
|------|------------|-------|----------|
| #1 | 250,000 | 1 | 250,000 |
| #2 | 150,000 | 1 | 150,000 |
| #3 | 100,000 | 1 | 100,000 |
| #4 – #10 | 50,000 | 7 | 350,000 |
| #11 – #20 | 15,000 | 10 | 150,000 |
| **Total** | — | **20** | **1,000,000** |

### 4.4 Ranking Metric

Weekly ranking = Total points earned during that week (from Daily Participation)

The Final Sprint Round uses the same metric but only counts activity during the final 6 days.

### 4.5 Qualification

| Requirement | Weekly Round | Final Sprint Round |
|-------------|-------------|-------------------|
| Minimum settled predictions | >= 10 | >= 8 |
| Minimum prediction volume | >= $20 | >= $15 |
| Active days | >= 2 days | >= 2 days |
| Abuse control | Required | Required |

---

## 5. Accuracy Bonus — 10,000,000 Points

Accuracy Bonus rewards the Top 200 users whose predictions are closest to the final settled results. Distributed at the end of the season.

### 5.1 Ranking Metric

```
Prediction Error = |Predicted PnL% – Actual PnL%|
Accuracy Score = Sum of all prediction errors / Number of valid predictions
```

Lower average error = higher accuracy ranking.

### 5.2 Reward Breakdown

| Rank | Points Each | Count | Subtotal |
|------|------------|-------|----------|
| #1 – #10 | 300,000 | 10 | 3,000,000 |
| #11 – #50 | 100,000 | 40 | 4,000,000 |
| #51 – #100 | 40,000 | 50 | 2,000,000 |
| #101 – #200 | 10,000 | 100 | 1,000,000 |
| **Total** | — | **200** | **10,000,000** |

### 5.3 Qualification

| Requirement | Threshold |
|-------------|-----------|
| Minimum settled predictions | >= 90 during the season |
| Minimum prediction volume | >= $150 during the season |
| Active days | >= 15 days |
| Abuse control | Required |

---

## 6. Monthly USDC Distribution

Every month (every 30 days from season start), Galeon distributes 50% of the Reserve Pool balance in USDC. There are 3 monthly distributions during the season.

| Time | Action |
|------|--------|
| Day 30 | Reserve Pool balance × 50% distributed |
| Day 60 | Reserve Pool balance × 50% distributed |
| Day 90 | Reserve Pool balance × 50% distributed |

The remaining 50% stays in the Reserve Pool and rolls forward.

### 6.1 Monthly USDC Distribution Structure

| Category | Share | Recipients | Rule |
|----------|-------|------------|------|
| Monthly Points Leaderboard | 70% | Top 100 | Ranked by monthly points (Daily Participation + Weekly Bonus earned that month) |
| Random Bonus Rewards | 30% | 50 winners | Randomly selected from eligible active participants who are not ranked in the monthly Top 100 Points Leaderboard |

### 6.2 Monthly Points Leaderboard — 70%

| Rank | Share | Count | Subtotal |
|------|-------|-------|----------|
| #1 | 10% | 1 | 10% |
| #2 | 6% | 1 | 6% |
| #3 | 4% | 1 | 4% |
| #4 – #10 | 2% each | 7 | 14% |
| #11 – #30 | 0.8% each | 20 | 16% |
| #31 – #100 | 0.286% each | 70 | 20% |
| **Total** | — | **100** | **70%** |

### 6.3 Monthly Points Leaderboard Qualification

| Requirement | Threshold |
|-------------|-----------|
| Minimum settled predictions | >= 20 that month |
| Active days | >= 15 days that month |
| Abuse control | Required |

### 6.4 Random Bonus Rewards — 30%

| Rule | Detail |
|------|--------|
| Eligibility | Users with >= 5 settled predictions that month |
| Exclusion | Monthly Points Leaderboard Top 100 users are excluded |
| Winners | 50 |
| Distribution | Equal split of the 30% Random Bonus pool |
| Abuse control | Required |

Public wording:

> Random Bonus Rewards are distributed to 50 eligible active participants each month, excluding users already ranked in the monthly Top 100 Points Leaderboard.

---

## 7. Example: Reserve Pool = $10,000

```
Airdrop Pool = $10,000 × 50% = $5,000
Points Pool = $5,000 × 70% = $3,500
Random Bonus Pool = $5,000 × 30% = $1,500
```

| Category | Reward |
|----------|--------|
| Monthly Points #1 | $500 |
| Monthly Points #2 | $300 |
| Monthly Points #3 | $200 |
| Monthly Points #4 – #10 | $100 each |
| Monthly Points #11 – #30 | $40 each |
| Monthly Points #31 – #100 | ~$14.30 each |
| Random Bonus Rewards | 50 winners × $30 each |

Each month, up to 150 users can receive USDC rewards. Across 3 months, up to 450 monthly USDC reward slots can be distributed.

---

## 8. Anti-Abuse & Fair Play

| Rule | Detail |
|------|--------|
| Only settled pools count | Canceled, refunded, failed predictions excluded |
| Minimum prediction amount | $1 |
| Abnormal accounts | Multi-account farming, wash participation, bots, coordinated abuse excluded |
| Platform rights | Galeon reserves the right to remove suspicious accounts from points, leaderboards, and USDC distributions |

Public-facing version:

> Fair Play Rules Apply. Suspicious activity will be excluded from rewards.

---

## 9. Frontend Page Structure

### Hero Section

```
Galeon Prediction Season 1
100,000,000 Points + Monthly USDC Rewards
90 Days. Trade. Predict. Compete. Earn your share.

Season Progress: Day X / 90
Season countdown: XX days remaining
Next USDC distribution: XX days
```

### Reward Pool Overview (3 Cards)

```
Daily Participation | 888,889 Points/Day | All Users
Weekly Bonus        | 10,000,000 Points  | Top 20/Round
Accuracy Bonus      | 10,000,000 Points  | Top 200/Season End
```

### Monthly USDC Section

```
Monthly USDC Rewards from Reserve Pool
50% of Reserve Pool distributed every 30 days
70% → Monthly Points Leaderboard Top 100
30% → Random Bonus Rewards for 50 eligible participants outside the Top 100

Reserve Pool: $XX,XXX
Next distribution: XX days
```

### My Stats

```
My Total Points
My Participation Points
My Weekly Rank
My Season Rank
My Accuracy Rank
Valid Predictions
Total Prediction Volume
Net Profit
Accuracy Score
```

### Leaderboard Tabs

```
Weekly Leaderboard
Monthly Points Leaderboard
Accuracy Leaderboard
Season Leaderboard
```

---

## 10. Final Marketing Copy

### Official Version

Galeon Prediction Season 1 is launching with a 100,000,000 Points reward pool and monthly USDC rewards for Trade Prediction Market participants.

Over 90 days, users can earn points through valid prediction participation, weekly profit leaderboards, and prediction accuracy bonuses. Points will be used to determine eligibility and allocation weight for future Galeon ecosystem rewards.

Every month, 50% of the Reserve Pool will be distributed in USDC: 70% to the Top 100 monthly points leaders and 30% to 50 eligible active participants through Random Bonus Rewards.

Trade. Predict. Compete. Earn your share.

### Short Version

Galeon Prediction Season 1

100,000,000 Points. 90 Days. Monthly USDC Rewards.

Predict on Galeon Brain trades, earn points, compete on leaderboards, and share monthly USDC rewards from the Reserve Pool.

---

## 11. Final Key Parameters

| Parameter | Final Setting |
|-----------|--------------|
| Duration | 90 days |
| Points Pool | 100,000,000 Points |
| Daily Participation | 80,000,000 Points (888,889/day, weight-based daily distribution) |
| Weekly Bonus | 10,000,000 Points / Top 20 per round; 12 weekly rounds + 1 final sprint round |
| Accuracy Bonus | 10,000,000 Points / Top 200 at season end |
| Monthly USDC | 50% of Reserve Pool distributed every 30 days |
| Monthly USDC Split | 70% Monthly Points Leaderboard Top 100; 30% Random Bonus Rewards to 50 eligible active participants outside Top 100 |
