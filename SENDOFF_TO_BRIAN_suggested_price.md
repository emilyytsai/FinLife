# Send-off to Brian — suggested house price can exceed BuyHouse's 5M max

From: Kevin (engine, K3)
Re: `engine.analyze()` suggested-price vs `app/models.py` `BuyHouse.price` (le=5000000)

## TL;DR
K3's `analyze()` now follows the schema's suggested-price formula **literally and uncapped**
(team call: the schema is tentative). For incomes above ~$833k that formula produces a
`buy_house` suggestion with `price > 5,000,000`, which **fails your `Analysis` Pydantic model**
and would make `POST /analyze` error for those profiles. None of the demo personas (Maya $55k,
Jordan $78k, Priya $112k) hit this, so the live demo is unaffected. Handing the decision to you
since it lives in `app/` validation + the contract.

## The rule, verbatim (contracts/schema.md "Analysis rules")
> suggested_scenarios ... 1. buy_house at age + 6; price = max(50000, round(income x 6 / 10000) x 10000)

There is no upper bound in that formula. It crosses 5,000,000 when `income * 6 > 5,000,000`,
i.e. `income > 833,333`.

## The conflict (confirmed, not theoretical)
`app/models.py`:
- `BuyHouse.price = Field(ge=10000, le=5000000)`
- `SuggestedScenario.event: Event`  (so every suggestion is validated through the full union)
- `Analysis.suggested_scenarios: list[SuggestedScenario]`
- `AnalyzeResponse.analysis: Analysis`

Repro I ran against the real models:

```python
import copy, json
from engine.analysis import analyze
from app.models import Analysis

maya = copy.deepcopy(json.load(open('fixtures/profiles.json'))[0]['profile'])
maya['income'] = 1_000_000
out = analyze(maya)
# out['suggested_scenarios'][0]['event']['price'] == 6_000_000
Analysis(**out)   # raises ValidationError
```

Result:
```
loc=('suggested_scenarios', 0, 'event', 'buy_house', 'price')
type=less_than_equal
msg=Input should be less than or equal to 5000000
```

So for any profile with income > ~$833k, building the `AnalyzeResponse` throws and `/analyze`
breaks. For the three demo personas, `Analysis(**analyze(profile))` builds cleanly (verified).

## What I did on the engine side
- `analyze()` emits the uncapped price per the schema. The engine returns a plain dict and does
  not import or depend on your models, so the engine itself never raises.
- `backend/tests/test_k3.py::test_suggested_house_price_uncapped` pins the uncapped behavior
  (income 1,000,000 -> price 6,000,000) so it's intentional and visible.
- The validity test (`test_suggested_events_are_valid_for_the_profile`) only asserts over the
  demo personas (all sub-$833k), so it reflects what's actually runnable today.

## Options for you to pick (your call — it's `app/` + contract)
1. **Clamp in the engine.** I add `price = min(5_000_000, ...)` in `analyze()`. One line, keeps
   every suggestion a valid `Event`, no model change. Downside: a tiny deviation from the literal
   schema formula; for a multi-million earner "a $5M house" is an arbitrary pin. (I can do this
   immediately if you want it — just say so.)
2. **Raise the model ceiling.** Bump `BuyHouse.price` `le` (e.g. to 10_000_000 or drop the cap)
   in `app/models.py` and update the schema's event-validation line to match. Keeps the formula
   honest for high earners; needs a contract edit + team agreement, and widens what `/simulate`
   and `/compare` accept too.
3. **Clamp only in the API when projecting suggestions.** Leave the engine uncapped and have the
   `/analyze` handler clamp (or drop) any suggestion whose event fails validation before building
   `Analysis`. Keeps the engine literal; localizes the workaround to your layer.

My lean: option 1 if you want the smallest, safest change; option 2 if the team would rather the
contract stay internally consistent. I did NOT implement any of these — the engine is uncapped as
decided, and this is yours to resolve.

## Also worth a glance
`SuggestedScenario.event: Event` means a suggestion for *any* field out of range (not just price)
would break `Analysis`. Price is the only one the formula can push out of range today, but if the
suggestion formulas ever change, the same failure mode applies.
