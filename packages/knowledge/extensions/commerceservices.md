# commerceservices

## Purpose
Provides the core B2C/B2B commerce service layer for SAP Commerce: cart, checkout, order placement, customer account, promotions, store-finder, stock, search, and multi-site isolation foundations used by all accelerator storefronts and OCC.

## Character
core

## Key items

| Type | Extends | What it represents |
|------|---------|-------------------|
| `BaseSite` extends `BaseSite` (core) | — | Extended with `channel` (B2B/B2C), `defaultPromotionGroup`, `solrFacetSearchConfiguration`, `dataIsolationEnabled`, `requiresAuthentication` |
| `BaseStore` extends `BaseStore` (core) | — | Extended with `net`, `taxGroup`, `defaultCurrency`, `submitOrderProcessCode`, `pickupInStoreMode`, `externalTaxEnabled`, `productSearchStrategy` |
| `AbstractOrder` extends `AbstractOrder` (core) | — | Extended with `site`, `store`, `guid`, `paymentType`, `purchaseOrderNumber`, `quoteDiscountValuesInternal` |
| `AbstractOrderEntry` extends `AbstractOrderEntry` (core) | — | Extended with `deliveryPointOfService`, `costCenter` |
| `Order` extends `Order` (core) | — | Extended with `salesApplication`, `language`, `placedBy`, `quoteReference` |
| `Cart` extends `Cart` (core) | — | Extended with `saveTime`, `savedBy`, `quoteReference`, `earliestRetrievalDate` |
| `Customer` extends `Customer` (core) | — | Extended with `title`, `originalUid`, `type` (GUEST/REGISTERED), `contactEmail` (dynamic), `site`, `undecoratedUid`, `defaultPaymentInfo` |
| `CustomerList` extends `UserGroup` | — | Represents an agent-facing customer list with `implementationType` for pluggable search strategies |
| `SitePreference` extends `GenericItem` | — | Per-site preference per customer (e.g. saved pick-up location) |
| `FutureStock` extends `GenericItem` | — | Upcoming stock availability with `productCode`, `date`, `quantity` |
| `PickUpDeliveryMode` extends `DeliveryMode` | — | Click-and-collect delivery mode with `supportedMode` (BUY_AND_COLLECT / RESERVE_AND_COLLECT) |
| `SAPInvoice` extends `GenericItem` | — | External (S4) invoice linked to consignment entries |
| `SitePreference` extends `GenericItem` | — | Customer per-site preferences (pickUpLocation) |
| `B2BCostCenter` extends `GenericItem` | — | B2B cost center linked to order entries |
| `SolrIndexedPropertyFacetSort` (enum) | — | Count / Alpha / Custom facet sort modes |
| `SiteChannel` (enum) | — | B2B / B2C channel flag on BaseSite |
| `PickupInStoreMode` (enum) | — | DISABLED / BUY_AND_COLLECT / RESERVE_AND_COLLECT |
| `CustomerType` (enum) | — | GUEST / REGISTERED |
| `QuoteState` (enum) | — | Full buyer/seller/approver state machine values |
| `CheckoutPaymentType` (enum) | — | CARD / ACCOUNT |

## Services / Facades / DAO / Strategy

| Interface | Kind | Implementation | What it does |
|-----------|------|----------------|--------------|
| `CommerceCartService` | Service | `DefaultCommerceCartService` | Central cart facade: add/update/remove entries, restore, merge, validate, calculate; delegates to strategy objects |
| `CommerceCheckoutService` | Service | `DefaultCommerceCheckoutService` | Orchestrates checkout: set delivery address/mode, payment info, authorize payment, place order |
| `CommercePlaceOrderStrategy` | Strategy | `DefaultCommercePlaceOrderStrategy` | Converts cart to order, fires hooks (`CommercePlaceOrderMethodHook`) |
| `CommerceAddToCartStrategy` | Strategy | `DefaultCommerceAddToCartStrategy` / `CommerceAddToCartStrictStrategy` | Validates and adds product to cart; runs `AddToCartValidator` list then `CommerceAddToCartMethodHook` list |
| `CommerceUpdateCartEntryStrategy` | Strategy | `DefaultCommerceUpdateCartEntryStrategy` | Updates quantity/point-of-service on a cart entry; runs hooks |
| `CommerceCartCalculationStrategy` | Strategy | `DefaultCommerceCartCalculationStrategy` | Calls `CalculationService` + `PromotionsService`; fires `CommerceCartCalculationMethodHook`; variant `NonTransactionalCommerceCartCalculationStrategy` skips TX |
| `CommerceCartRestorationStrategy` | Strategy | `DefaultCommerceCartRestorationStrategy` | Restores a stale/anonymous cart to current user session |
| `CommerceCartMergingStrategy` | Strategy | `DefaultCommerceCartMergingStrategy` | Merges anonymous cart into logged-in customer cart using `EntryMergeFilter` chain |
| `CartValidationStrategy` | Strategy | `DefaultCartValidationStrategy` | Validates stock and product availability; extensible via `CartValidationHook` list |
| `CustomerAccountService` | Service | `DefaultCustomerAccountService` | Register, login, password change/reset, address book, payment info management, order history |
| `CommerceCommonI18NService` | Service | `DefaultCommerceCommonI18NService` | Resolves current language/currency from BaseSite/BaseStore context |
| `StoreSessionService` | Service | `DefaultStoreSessionService` | Sets session language/currency/store; invalidates cart on change |
| `CommerceStockService` | Service | `DefaultCommerceStockService` | Calculates available stock per product/PoS using `WarehouseSelectionStrategy` and `CommerceAvailabilityCalculationStrategy` |
| `CommerceProductService` | Service | `DefaultCommerceProductService` | Product stock/warehouse helpers used during cart ops |
| `CommercePriceService` | Service | `DefaultCommercePriceService` | Net/gross price lookup respecting `NetGrossStrategy` |
| `CommercePromotionService` | Service | `DefaultCommercePromotionService` | Reads applicable promotions from promotion groups; used in cart calculation |
| `StoreFinderService` | Service | `DefaultStoreFinderService` | Geo-search for PointOfService by lat/long/radius via `geoServiceWrapper` |
| `ProductSearchService` | Service | `DefaultSolrProductSearchService` | Delegates to `SolrFacetSearchProductSearchStrategy` or `SnProductSearchStrategy`; wraps Solr/searchservices |
| `CommerceSaveCartService` | Service | (inner) | Save/restore named carts for logged-in customers |
| `CommerceQuoteService` | Service | `DefaultCommerceQuoteService` | B2B quote lifecycle (create, submit, approve, reject, checkout) with state-machine validation |
| `PagedFlexibleSearchService` | Service | `DefaultPagedFlexibleSearchService` | Paged FlexibleSearch queries; used by most DAOs |

## Spring beans worth knowing

| Bean id / alias | Class | Why it matters |
|-----------------|-------|----------------|
| `abstractCommerceCartStrategy` | `AbstractCommerceCartStrategy` (abstract) | Base for all cart mutating strategies; inject `productService`, `cartService`, `commerceStockService`, etc. Extend instead of reimplementing |
| `abstractCommerceAddToCartStrategy` | `AbstractCommerceAddToCartStrategy` (abstract) | Base for add-to-cart; holds `addToCartValidators` and `fallbackAddToCartValidator` lists |
| `commerceAddToCartMethodHooks` | `util:list` | `listMergeDirective` target — inject your `CommerceAddToCartMethodHook` here |
| `commerceCartCalculationMethodHooks` | `util:list` | Hook list for pre/post cart calculation (e.g. apply loyalty) |
| `commercePlaceOrderMethodHooks` | `util:list` | Hook list for pre/post order placement |
| `authorizePaymentHooks` | `util:list` | Hook list around payment authorization |
| `commerceCartEntryMergeFilters` | `util:list` | `EntryMergeFilter` chain (product, units, PoS, group, giveaway, configurable) — add new filters here |
| `addToCartValidators` | `util:list` | `AddToCartValidator` chain — add validators (quantity limit, B2B rules) here |
| `cartValidationHooks` | `util:list` | `CartValidationHook` list used by `DefaultCartValidationStrategy` |
| `nonTransactionalCommerceCartCalculationStrategy` | `NonTransactionalCommerceCartCalculationStrategy` | Alias swap to skip TX during heavy batch calculation |
| `commerceNetGrossStrategy` | `CommerceNetGrossStrategy` | Reads `BaseStore.net` to decide net/gross; override for custom tax display logic |
| `netGrossStrategy` | alias → `commerceNetGrossStrategy` | Used by `CartFactory` and `NetPriceService` |
| `listMergeDirective` | (platform) | Pattern: `depends-on="commerceAddToCartMethodHooks" parent="listMergeDirective"` + `<property name="add" ref="myHook"/>` to add hooks without XML override |
| `abstractSiteEventListener` | `AbstractSiteEventListener` (abstract) | Base for commerce events scoped to a BaseSite; extend for `RegisterEvent`, `ForgottenPwdEvent`, etc. |
| `staleCartRemovalStrategy` | `DefaultStaleCartRemovalStrategy` | Cleans up expired anonymous carts on session start |

## Entry points

- **REST OCC:** None directly (OCC lives in `commercewebservices`); this extension provides all service/strategy beans consumed by OCC controllers.
- **Controllers:** None — pure service layer. Accelerator controllers live in `*storefront` extensions.
- **CronJobs:** None defined in this extension. Cart cleanup is triggered via `staleCartRemovalStrategy` on session events.
- **Business processes:** `forgottenPasswordProcess.xml` — single-step process firing `ForgottenPasswordAction` to send reset email.
- **Other:**
  - **Interceptors:** `CustomerOriginalUidPrepareInterceptor` (stores `originalUid`/`undecoratedUid` on Customer save); `MultiSiteCustomerValidateInterceptor` / `MultiSiteCustomerInitInterceptor` (data-isolation enforcement); `MultiSiteBaseSiteValidateInterceptor`.
  - **Event listeners:** `AbstractSiteEventListener` (base) — subclass and listen to `RegisterEvent`, `ForgottenPwdEvent`, `LoginSuccessEvent`, `ConsentGivenEvent`, `ConsentWithdrawnEvent`, `OrderCancelledEvent`, `OrderRefundEvent`, Quote events, etc.
  - **Session listeners:** `BaseSiteAfterSessionCreationListener`, `BaseSiteBeforeSessionCloseListener`, `BaseSiteAfterSessionUserChangeListener` — enforce site isolation on session lifecycle.

## Dependencies

- **requires-extension:** `basecommerce`, `customerreview`, `payment`, `promotions`, `solrfacetsearch`, `searchservices`, `auditreportservices`
- **external libs:** None beyond platform transitive deps (no direct third-party jars declared in `external-dependencies.xml` beyond standard Hybris stack).

## Pitfalls / gotchas

- `CommerceCartCalculationStrategy` wraps calculation in a transaction by default. Switch alias to `nonTransactionalCommerceCartCalculationStrategy` only if you control locking externally — otherwise you risk dirty reads.
- Hook lists (`commerceAddToCartMethodHooks`, etc.) are `util:list` beans — you **must** use `listMergeDirective` (`depends-on` + `parent`) to add items; overriding the list bean XML will silently discard platform hooks.
- `NetGrossStrategy` is resolved at cart-creation time via `CartFactory` — changing `BaseStore.net` after carts exist leaves existing carts with the old flag until they are recalculated.
- `CustomerOriginalUidPrepareInterceptor` sets `originalUid` on every Customer save. In multi-site data-isolation mode (`BaseSite.dataIsolationEnabled=true`), the uid is decorated with the site suffix — use `undecoratedUid` for cross-site lookups, not `uid`.
- `CommerceCartRestorationStrategy` uses `cartValidityPeriod` (property `commerceservices.cartValidityPeriod`) to expire anonymous carts; carts older than this are not restored but silently dropped.
- `DefaultCommerceCheckoutService` uses `checkoutCartCalculationStrategy` (not `commerceCartCalculationStrategy`) which has `calculateExternalTaxes=true`. Injecting the wrong strategy bean causes taxes to be skipped at checkout.
- `ProductSearchService` strategy is selected by `BaseStore.productSearchStrategy` bean name — omitting it falls back to Solr. If you add a custom strategy bean you must set this attribute or it is ignored.
