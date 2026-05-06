# promotionengineservices

## Purpose

Bridges the rule engine (`droolsruleengineservices`) with the legacy promotions module (`promotions`). Translates compiled Drools rules into concrete promotion results on orders/carts: evaluates conditions via RAOs, fires Drools rules, and applies action strategies that create `AbstractRuleBasedPromotionAction` persisted items on the cart.

This extension replaces the old hand-coded `AbstractPromotion` evaluation loop with a declarative, Drools-backed pipeline. Promotions defined as `PromotionSourceRule` in Backoffice are compiled to `.drl` and deployed to a KIE session; at cart calculation time the engine fires the session and the results are persisted as `PromotionResult`/`AbstractRuleBasedPromotionAction` — the same structures the legacy promotion module reads.

## Character

Core service layer — no web layer, no storefront. Pure backend: Spring services, DAOs, interceptors, AOP aspect, compiler listeners, RAO providers, and action strategies.

## Key items

| Type | Extends | Notes |
|---|---|---|
| `PromotionSourceRule` | `SourceRule` (ruleengineservices) | The editable source rule; has `excludeFromStorefrontDisplay` flag; linked to `PromotionGroup` via `PromotionGroup2PromotionSourceRuleRelation` |
| `PromotionSourceRuleTemplate` | `SourceRuleTemplate` | Template for creating new promotion rules in Backoffice |
| `RuleBasedPromotion` | `AbstractPromotion` | Created automatically when a rule is compiled/published; stores `messageFired` (localized), `promotionDescription`, `ruleVersion`, link to `AbstractRuleEngineRule` |
| `AbstractRuleEngineRule` | — (extended from ruleengine) | Gains a `promotion` back-reference to `RuleBasedPromotion` |
| `AbstractRuleBasedPromotionAction` | `AbstractPromotionAction` | Abstract base; holds `rule`, `strategyId`, `metadataHandlers` |
| `RuleBasedOrderAdjustTotalAction` | above | Cart-level discount (`amount: BigDecimal`) |
| `RuleBasedOrderEntryAdjustAction` | above | Entry-level discount (`amount`, `orderEntryProduct`, `orderEntryQuantity`, `orderEntryNumber`) |
| `RuleBasedOrderAddProductAction` | above | Free gift (`product`, `quantity`) |
| `RuleBasedOrderChangeDeliveryModeAction` | above | Shipping promotion (`deliveryMode`, `deliveryCost`, replacedMode/cost) |
| `RuleBasedPotentialPromotionMessageAction` | above | "You could save…" message with `PromotionActionParameterCollection` |
| `PromotionResult` | — (extended from promotions) | Gains `rulesModuleName`, `moduleVersion`, `ruleVersion`, `messageFired`, `orderCode` |
| `PromotionActionParameter` | `GenericItem` | Key/value payload for parameterized messages (`uuid`, `value: Object`) |
| `CatForPromotionSourceRule` | `GenericItem` | Lookup table: category code → rule → promotion (indexed) |
| `ProductForPromotionSourceRule` | `GenericItem` | Lookup table: product code → rule → promotion (indexed) |
| `ExcludedCatForRule` / `ExcludedProductForRule` | `GenericItem` | Negative lookup tables for exclusions |
| `CombinedCatsForRule` | `GenericItem` | Multi-category condition groups (`rule`, `conditionId`, `categoryCode`) |

Enum extension: `RuleType.PROMOTION`, `FactContextType.PROMOTION_ORDER` / `PROMOTION_PRODUCT`.

## RAO (Rule Action Object) cycle

RAOs are plain Java objects (POJOs) that represent facts inserted into the Drools working memory. The cycle during cart evaluation:

1. **Fact population** — `RAOProvider` implementations convert `AbstractOrderModel` (and related objects) into RAO POJOs (`CartRAO`, `OrderEntryRAO`, `DeliveryModeRAO`, `WebsiteGroupRAO`, `UserRAO`, etc.) and insert them into the KIE session as facts.
2. **Rule firing** — Drools evaluates the `.drl` rules against the fact set. When a rule's LHS (conditions) matches, its RHS executes a `RuleActionRAO` that describes what discount/action to apply.
3. **Action translation** — `DefaultPromotionRuleActionService` (alias `ruleActionService`) receives the fired `AbstractRuleActionRAO` and dispatches it to the matching `RuleActionStrategy` via `promotionActionStrategiesMapping`.
4. **Persistence** — Each strategy creates a concrete `AbstractRuleBasedPromotionAction` item and calls `calculationService.recalculate()` to apply the discount to the cart.

Key RAO providers registered for `PROMOTION_ORDER` context: `promotionCartRaoProvider`, `promotionEntryGroupRaoProvider`, `promotionDeliveryModeRaoProvider`, `customerSupportRAOProvider`, `campaignRaoProvider`.

## Rule deployment lifecycle

```
PromotionSourceRule (UNPUBLISHED)
  → [Compile] → AbstractRuleEngineRule (DroolsRule, .drl content) + RuleBasedPromotion created
  → [Publish] → rule deployed to DroolsKIEModule (promotions-module), KIE session rebuilt
  → [Evaluate] → promotionEngineService.evaluate(cart) → Drools fires → actions persisted
  → [Undeploy] → rule removed from module, RuleBasedPromotion deactivated
```

Module topology (from essentialdata): `DroolsKIEModule: promotions-module` → `DroolsKIEBase: promotions-base` (EQUALITY/STREAM) → `DroolsKIESession: promotions-session` (STATEFUL) → `DroolsRuleEngineContext: promotions-context` (ruleFiringLimit=200).

A preview module (`promotions-preview-module`) exists for Backoffice rule testing without affecting the live session.

**Vs. legacy promotions module**: Legacy `promotions` extension uses hand-written Java `AbstractPromotion` subclasses evaluated in a loop; no Drools, no declarative conditions/actions, no Backoffice rule builder. `promotionengineservices` replaces that loop while reusing the persistence layer (`PromotionResult`, `AbstractPromotionAction`) for backward compatibility with order display and reporting.

## Services / Facades / DAO / Strategy

| Interface / Alias | Kind | Implementation | What it does |
|---|---|---|---|
| `promotionEngineService` (also aliased `promotionsService`) | Service | `DefaultPromotionEngineService` | Main entry point: evaluates promotions for an order/product, orchestrates RAO fact building → rule engine firing → action application |
| `ruleActionService` | Service | `DefaultPromotionRuleActionService` extends `defaultRuleActionService` | Dispatches fired `AbstractRuleActionRAO` to the correct `RuleActionStrategy` |
| `promotionActionService` | Service | `DefaultPromotionActionService` | Creates/undoes `AbstractRuleBasedPromotionAction` model items; handles recalculation |
| `promotionEngineResultService` / `promotionResultService` | Service | `DefaultPromotionEngineResultService` | Populates localized `messageFired` on `PromotionResult` using resolution strategies |
| `reportPromotionService` | Service | `DefaultReportPromotionService` | Converts `PromotionResult` list into structured `PromotionEngineResults` DTO for display |
| `promotionSourceRuleDao` | DAO | `DefaultPromotionSourceRuleDao` | Queries `PromotionSourceRule` by website/catalog |
| `promotionDao` | DAO | `DefaultPromotionDao` | Queries `RuleBasedPromotion` |
| `ruleBasedPromotionActionDao` | DAO | `DefaultRuleBasedPromotionActionDao` | Finds `AbstractRuleBasedPromotionAction` by `PromotionResult` |
| `orderTotalAdjustActionStrategy` | Strategy | `DefaultOrderAdjustTotalActionStrategy` | Applies order-level discount; creates `RuleBasedOrderAdjustTotalAction` |
| `orderEntryAdjustActionStrategy` | Strategy | `DefaultOrderEntryAdjustActionStrategy` | Applies entry-level discount; creates `RuleBasedOrderEntryAdjustAction` |
| `shippingActionStrategy` | Strategy | `DefaultShippingActionStrategy` | Changes delivery mode and cost |
| `addProductToCartActionStrategy` | Strategy | `DefaultAddProductToCartActionStrategy` | Adds free gift product to cart |
| `potentialPromotionMessageActionStrategy` | Strategy | `DefaultPotentialPromotionMessageActionStrategy` | Creates "potential" (not-yet-fired) promotion messages |
| `websiteGroupRaoProvider` | Provider | `DefaultWebsiteGroupRAOProvider` | Converts `PromotionGroupModel` → `WebsiteGroupRAO` |
| `customerSupportRAOProvider` | Provider | `DefaultCustomerSupportRAOProvider` | Adds CS agent context as fact |
| `ruleBasedPromotionsContextValidator` | Validator | `DefaultRuleBasedPromotionsContextValidator` | Validates that a rule engine context exists for the catalog versions being evaluated |

Resolution strategies for `messageFired` parameter interpolation: `currencyAmountResolutionStrategy`, `productResolutionStrategy`, `categoryResolutionStrategy`, `objectResolutionStrategy` (and list variants).

## Spring beans worth knowing

- `defaultActionStrategies` — ordered `List` of all action strategies; extend via `listMergeDirective` to add custom strategies
- `promotionActionStrategiesMapping` — `Map<String, RuleActionStrategy>` keying RAO action bean id to strategy; extend via `mapMergeDirective`
- `abstractRuleActionStrategy` — abstract parent for all strategies; supplies `modelService`, `calculationService`, `extendedOrderDao`, `promotionResultUtils`, `actionUtils`, metadata key list
- `ActionLogger` — AOP aspect that logs every fired strategy invocation
- `promotionRulePrepareInterceptor` — `PrepareInterceptor` on `AbstractRuleEngineRule`; rebuilds `RuleBasedPromotion` on save
- `promotionSourceRuleValidateInterceptor` — `ValidateInterceptor` on `PromotionSourceRule`; enforces no identical products/categories constraint
- `cartBasedMaxRuleExecutionsFunction` — controls how many times a single rule can fire per cart evaluation
- `promotionEngineHistoricalRuleContentProvider` — provides historical `.drl` content for version rollback

Compiler hooks (in `promotionengineservices-compiler-spring.xml`):
- `promotionRuleCompilerListener` — post-compile listener; resolves product/category codes and populates `ProductForPromotionSourceRule` / `CatForPromotionSourceRule` lookup tables
- `promotionRuleIrProcessor` — IR (Intermediate Representation) processor; injects promotion-specific IR transformations before `.drl` generation

## Entry points

**CronJobs** (registered via `RuleEngineJob`):
- `rules -> Compilation and Publishing for [promotions-module]` — compiles and publishes all active `PromotionSourceRule` to the live KIE module (`ruleEngineCompilePublishJobPerformable`)
- `rules -> Undeploy for [promotions-module]` — removes rules from live module
- `rules -> Modules Sync from [promotions-module] to [promotions-preview-module]` — syncs live → preview for Backoffice testing
- `rules -> Module Init for [promotions-module]` — (re)initializes the KIE module
- `rules -> All Modules Init` — initializes all registered modules

**Evaluation trigger**: `promotionEngineService.updatePromotions(promotionGroups, order, recalculate)` called from `DefaultCommerceCartService` on cart modification. Also `getProductPromotions(promotionGroups, product)` for PDP.

**Other**: `PromotionEngineServicesSystemSetup` (extends `abstractRuleEngineSystemSetup`) runs essential data import on system initialization.

## Dependencies

| Extension | Role |
|---|---|
| `droolsruleengineservices` | Drools KIE runtime, rule compilation pipeline, `DroolsKIEModule/Base/Session`, `AbstractRuleEngineRule` |
| `ruledefinitions` | OOTB condition/action definitions (`y_cart_total`, `y_qualifying_products`, `y_order_percentage_discount`, etc.) |
| `promotions` | Legacy promotion model layer (`AbstractPromotion`, `PromotionResult`, `AbstractPromotionAction`, `PromotionGroup`) |

## Pitfalls / gotchas

- **`ruleFiringLimit=200`** on `promotions-context` — if a complex rule set causes more than 200 Drools activations, rules silently stop firing. Raise the limit in impex if needed.
- **Two-module topology**: live (`promotions-module`) vs. preview (`promotions-preview-module`). Backoffice "test" runs against preview; storefront evaluates live. After publishing, the KIE session is rebuilt asynchronously — there is a brief window where the old session is still active.
- **`PromotionRuleCompilerListener` lookup tables**: `ProductForPromotionSourceRule` and `CatForPromotionSourceRule` are populated at compile time, not at evaluation time. If products/categories referenced in a rule are changed after compilation without re-publishing, the lookup tables go stale.
- **`excludeFromStorefrontDisplay`** on `PromotionSourceRule` suppresses the promotion from PDP/category page display but does NOT prevent it from firing at cart evaluation.
- **`WebsiteGroupRAO`** must match the cart's `PromotionGroup`. If a site's promotion group is not passed to `updatePromotions`, the rule's `y_qualifying_website` condition will not match and no promotions fire.
- **Stateful KIE session**: sessions are `STATEFUL`, meaning facts inserted in one evaluation remain unless explicitly retracted. `promotionEngineService` handles retraction of stale actions before each re-evaluation; custom strategies must not leave orphan facts.
- **`noopCouponCodeRetrievalStrategy`**: coupon support is a no-op by default; it is overridden by `couponservices` extension when present.
