# sniezkabrandstorefront

## Cel

Storefront (warstwa webowa) dla sklepów markowych: Vidaron, Magnat, Śnieżka oraz ewentualnych kolejnych marek. Obsługuje prezentację produktów, checkout, inspiracje, porady, kalkulator zużycia i lokalizator sklepów dla każdej marki osobno, sterując wyglądem przez motyw (`SiteTheme`) przypisany do `CMSSite`.

## Charakter

- Rozszerzenie typu **web** (`modulegen-name: accelerator`).
- Wspólna baza kodu dla wszystkich marek — motyw (`theme`) wybierany dynamicznie przez `SiteThemeResolverUtils` na podstawie `CMSSiteModel.uid` + `SiteTheme`.
- Wyklucza koszyk/checkout z filtra gościa dla ścieżki `/integration/` (osobny `integrationTenantFilterChain`).
- Wszystkie strony oparte na JSP (`responsive/`), pliki CSS/JS budowane przez Grunt + Wro4j.

## Dependencies

| Zależność | Rola |
|---|---|
| `sniezkacommonweb` | Wspólne filtry, strategie kalkulatorów, CMS-filtry |
| `sniezkafacades` | Fasady biznesowe (produkty, wyszukiwanie, koszyk) |
| `acceleratorstorefrontcommons` | Bazowe kontrolery, breadcrumby, security |
| `assistedservicestorefront` | Wsparcie ASM |
| `smarteditaddon` | Edycja CMS w trybie preview |
| `adaptivesearchsamplesaddon` | Adaptive search |

## Kluczowe items

Brak własnego `items.xml` — rozszerzenie jest czysto webowe. Korzysta z typów CMS zdefiniowanych w `sniezkacore` (`HomepageBannerComponentModel`, `CustomProductsDetailsComponentModel`, `MixerColorGroupComponentModel`, `FAQComponentModel`, `ArticlesBannerComponentModel` i in.) oraz ze standardowych typów akceleratora.

## Services / Facades / Strategies

- `GuestCheckoutCartCleanStrategy` — własna implementacja czyszczenia koszyka gościa po checkout.
- `SiteThemeResolverUtils` — resolwuje motyw na podstawie `CMSSiteModel.uid + SiteTheme`; wynik: `"responsive,<siteUid>,<themeCode>"`.
- `LandingPageTitleResolver` — tytuł SEO dla landing pages produktów.
- `SniezkaCalculatorProcessorStrategy` / `MagnatCalculatorProcessorStrategy` / `VidaronCalculatorProcessorStrategy` — brand-specyficzne procesory kalkulatora zużycia (bean aliasy w `spring-mvc-config.xml`).
- `SniezkaCalculatorViewStrategy` / `MagnatCalculatorViewStrategy` / `VidaronCalculatorViewStrategy` — widoki kalkulatora per marka.

## Spring beany

Zdefiniowane w czterech plikach:

| Plik | Treść |
|---|---|
| `spring-filter-config.xml` | Łańcuch filtrów: `storefrontTenantFilterChain` (→ `UrlPathFilter`), ciasteczka, `CMSSiteFilter`, `maintenanceBreakFilter`, `seoUrlFilter`, `anonymousCheckoutFilter`, `cartRestorationFilter` |
| `spring-mvc-config.xml` | `localeResolver`, `viewResolver`, interceptory (`BeforeControllerHandlerInterceptor`, `BeforeViewHandlerInterceptor` + handlery), breadcrumby, strategie kalkulatorów, `siteThemeResolverUtils` |
| `spring-security-config.xml` | `acceleratorAuthenticationProvider`, `defaultRememberMeServices`, CSRF (`csrfProtectionMatcher`, `csrfTokenRepository`), `guidCookieStrategy`, `defaultGuestCheckoutCartCleanStrategy` |
| `spring-cms-config.xml` | `acceleratorCMSComponentRendererRegistry`, renderers: `defaultCMSLinkComponentRenderer`, `defaultImageMapComponentRenderer` |

## Entry points

### Kontrolery stron (`/pages`)

| Ścieżka | Kontroler |
|---|---|
| `/` | `HomePageController` |
| `/product/**` | `ProductLandingPageController` (landing page produktu, kalkulator zużycia) |
| `/products` | `ProductsPageController` |
| `/set/**` | `ProductSetFamilyLandingPageController` |
| `/sets` | `SetsListPageController` |
| `/search` | `SearchPageController` |
| `/advices` | `AdvicesPageController` |
| `/inspirations` | `InspirationsPageController` |
| `/contact` | `ContactsPageController` |
| `/store-finder` | `StoreLocatorPageController` |
| `/**/store` | `StorePageController` |
| `/newsletter` | `NewsletterController` |
| `/maintenance` | `MaintenanceBreakPageController` |
| `/preview-content` | `PreviewContentPageController` |
| `/checkout/multi/**` | `MultiStepCheckoutController`, `DeliveryAddressCheckoutStepController`, `DeliveryMethodCheckoutStepController`, `PickupLocationCheckoutStepController`, `PaymentMethodCheckoutStepController`, `SummaryCheckoutStepController`, `HopPaymentResponseController`, `SopPaymentResponseController` |

### Kontrolery CMS (`/view/`)

`HomepageBannerComponentController`, `HomepageInspirationAndAdviceSelectComponentController`, `CustomProductsDetailsComponentController`, `CustomProductSetDetailsComponentController`, `CustomRelatedProductsComponentController`, `CustomImageLinkComponentController`, `CustomContentGalleryInspirationComponentController`, `MixerColorGroupComponentController`, `FAQComponentController`, `ArticlesBannerComponentController`, `AdviceTeaserComponentController`, `ProductLandingPageController` (jako CMS), `DynamicBannerComponentController`, `CMSPageUrlResolvingController`.

### Filtry

`UrlPathFilter` (router tenant chain) → `CMSSiteFilter` → `StorefrontFilter` (z `sniezkacommonweb`) → `MaintenanceBreakFilter` → `SeoUrlFilter` → `AnonymousCheckoutFilter` → `CartRestorationFilter` → `CustomerLocationRestorationFilter`.

### Interceptory

**BeforeController:** `DeviceDetectionBeforeControllerHandler`, `RequireHardLoginBeforeControllerHandler`, `SecurityUserCheckBeforeControllerHandler`, `SetLanguageBeforeControllerHandler`, `SetUiExperienceBeforeControllerHandler`, `ThemeBeforeControllerHandler`.

**BeforeView:** `CmsPageBeforeViewHandler`, `CartRestorationBeforeViewHandler`, `CookieNotificationBeforeViewHandler`, `ConsentManagementBeforeViewHandler`, `NewsletterBeforeViewHandler`, `HrefPageBeforeViewHandler`, `SeoRobotsFollowBeforeViewHandler`, `GoogleMapsBeforeViewHandler`, `UiThemeResourceBeforeViewHandler`.

## Pułapki / gotchas

- **Motyw per marka:** `SiteThemeResolverUtils.resolveThemeForCurrentSite()` zwraca `"responsive,<siteUid>,<themeCode>"` — jeśli `CMSSite.theme` jest puste, fallback na `defaultTheme` z konfiguracji Springa (może renderować zły CSS dla nowej marki).
- **Kalkulatory zużycia:** strategie procesora i widoku są bean-aliasami — przy dodaniu nowej marki trzeba zarejestrować nowy alias zarówno dla `ProcessorStrategy` jak i `ViewStrategy`.
- **Filtr `/integration/`:** ścieżka `/integration/*` omija większość filtrów storefrontu (brak CSRFa, brak CMS); callback Fraud i Merchant trafiają tamtędy.
- **CSRF:** używa `XorCsrfTokenRequestAttributeHandler` (Spring Security 6) + `HttpSessionCsrfTokenRepository`; wyjątki z ochrony obsługuje `CsrfProtectionMatcher` (sprawdza `excludeUrlSet`).
- **Wro4j:** zasoby CSS/JS serwowane przez `/wro/*`; plik `wro_addons.xml` scala zasoby z addonów — błędna kolejność w `buildcallbacks.xml` może skutkować brakującymi styli addonów.
- Rozszerzenie **nie ma własnego `items.xml`** — modyfikacje typów CMS wymagają zmian w `sniezkacore`.
