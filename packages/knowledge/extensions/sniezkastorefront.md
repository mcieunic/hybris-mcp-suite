# sniezkastorefront

## Cel
Warstwa prezentacyjna B2B storefront Śnieżka — Spring MVC web application obsługująca cały kanał sprzedaży online: od logowania przez koszyk i checkout po konto klienta i specyficzne funkcjonalności B2B (faktury, awizacje, zamówienia od dystrybutora, onboarding).

## Charakter
web

## Kluczowe items
Brak własnych `items.xml` — rozszerzenie jest czysto webowe i nie definiuje własnych typów modelu.

## Services / Facades / DAO / Strategy

| Interface | Kind | Implementacja | Co robi |
|-----------|------|---------------|---------|
| `CheckoutDeliveryModeViewStrategy` | Strategy | (kilka impl. per tryb dostawy) | Wypełnia model widoku danymi zależnymi od trybu dostawy; wybiera fragment JSP do wyrenderowania |
| `GuestCheckoutCartCleanStrategy` | Strategy | `DefaultGuestCheckoutCartCleanStrategy` | Czyści dane koszyka gościa po opuszczeniu checkoutu |

## Spring beany worth knowing

- `anonymousCheckoutFilter` (AnonymousCheckoutFilter) — zabezpiecza URL checkoutu przed anonimowym dostępem
- `cartRestorationFilter` (CartRestorationFilter) — przywraca koszyk z ciasteczka po powrocie użytkownika
- `givenConsentFilter` (GivenConsentFilter) — wymusza zgodę RODO przed dostępem do chronionych stron
- `maintenanceBreakFilter` (MaintenanceBreakFilter) — przekierowuje na stronę przerwy technicznej gdy flaga aktywna
- `extendedAssistedServiceFilter` (ExtendedAssistedServiceFilter) — rozszerzony filtr ASM (Assisted Service Mode)
- `customB2BAcceleratorAuthenticationProvider` (CustomB2BAcceleratorAuthenticationProvider) — provider logowania B2B z customową logiką grup
- `ajaxAwareAuthenticationEntryPoint` (AjaxAwareAuthenticationEntryPoint) — zwraca 401 dla żądań AJAX zamiast redirect na login
- `defaultBeforeControllerHandlerInterceptor` (BeforeControllerHandlerInterceptor) — uruchamia łańcuch before-controller handlers (język, UI experience, shop-closed, security)
- `defaultBeforeViewHandlerInterceptor` (BeforeViewHandlerInterceptor) — uruchamia łańcuch before-view handlers (CMS page, Google Analytics, LuigisBox, chatbot, consent)
- `defaultCMSLinkComponentRenderer` (CMSLinkComponentRenderer) — customowy renderer linków CMS
- `customAssistedServiceAgentLoginStrategy` (CustomAssistedServiceAgentLoginStrategy) — customowa strategia logowania agenta ASM
- `localeResolver` (StoreSessionLocaleResolver) — resolwer locale oparty na sesji sklepu

## Entry points

- REST OCC: brak — rozszerzenie nie eksponuje OCC endpoints (to robi `sniezkawebservices`)
- Controllers (page):
  - `CartPageController` — koszyk, operacje AJAX na pozycjach
  - `CheckoutController` / `MultiStepCheckoutController` — wielokrokowy checkout B2B
  - `DeliveryAddressCheckoutStepController` / `DeliveryMethodCheckoutStepController` — kroki checkoutu
  - `ExtendedSummaryCheckoutStepController` — podsumowanie zamówienia z logiką Śnieżki
  - `ProductPageController` — strona produktu z warstwą B2B
  - `CategoryPageController` / `SearchPageController` — listing i wyszukiwanie
  - `InvoicesPageController` — lista i pobieranie faktur (integracja ERP)
  - `DeliveryNotesPageController` — awizacje dostaw
  - `OnlinePaymentController` / `OnlineFvPaymentController` — obsługa płatności online i faktur online
  - `OrderFromStockOfDistributorController` — zamówienie ze stocku dystrybutora
  - `ImportCSVPageController` — import pozycji zamówienia z CSV (saved cart)
  - `MaintenanceBreakPageController` — strona przerwy technicznej (guard na flagę konfiguracyjną)
  - `OnboardingPageController` — onboarding nowego klienta B2B
  - `Promotion2B2BUnitPageController` — produkty z promocji przypisanych do B2BUnit
  - `PricingController` — endpoint AJAX cen produktów dla LuigisBox autocomplete
  - `AccountPageController` / `AccountSavedCartsPageController` — konto klienta, zapisane koszyki
- Controllers (CMS):
  - `HomepageBannerComponentController` — karuzela banerów strony głównej
  - `DynamicBannerComponentController` — banery dynamiczne
  - `LastOrdersComponentController` / `LastOrdersToApproveComponentController` — ostatnie zamówienia (do akceptacji)
  - `LimitsPaymentsComponentController` — limity kredytowe i zaległe płatności
  - `DistributorSelectionComponentController` — wybór dystrybutora
  - `BonusesComponentController` — program bonusowy
  - `MyPromotionsComponentController` — promocje klienta
- Interceptory (before-controller): `ShopClosedBeforeControllerHandler`, `RequireHardLoginBeforeControllerHandler`, `SetLanguageBeforeControllerHandler`, `SecurityUserCheckBeforeControllerHandler`
- Interceptory (before-view): `LuigisBoxBeforeViewHandler`, `ChatbotBeforeViewHandler`, `OverduePaymentsExceededCreditViewHandler`, `ConsentManagementBeforeViewHandler`, `CmsPageBeforeViewHandler`
- CronJoby: brak
- Business processes: brak

## Dependencies

- requires-extension: `acceleratorstorefrontcommons`, `sniezkacommonweb`, `sniezkafacades`, `b2bacceleratoraddon`, `commerceorgaddon`, `assistedservicestorefront`, `assistedservicepromotionaddon`, `customerticketingaddon`, `sniezkaticketingc4cintegration`, `smarteditaddon`, `adaptivesearchsamplesaddon`, `eventtrackingwsaddon`, `hybrisanalyticsaddon`, `sapymktrecommendationaddon`
- external libs: LuigisBox (integracja w before-view handler i `PricingController`), biblioteki frontendowe zarządzane przez Grunt/Gulp + Bower

## Pułapki / gotchas

- `HomepageBannerComponentController` rzuca NPE bez null-checka na `bgImage` — karuzela owl pozostaje pusta bez błędu widocznego dla użytkownika (patrz MEMORY).
- `MaintenanceBreakPageController` sprawdza flagę z `CustomConfigurationService`; bezpośrednie wejście na `/maintenance` bez aktywnej flagi robi redirect na homepage.
- Filtr `givenConsentFilter` jest obecny w łańcuchu — strony wymagające zgody RODO muszą mieć poprawnie skonfigurowane CMS consent templates, inaczej użytkownik może zostać zablokowany w pętli redirect.
- `customB2BAcceleratorAuthenticationProvider` + `customB2bUserGroupProvider` — logowanie na CZ/SK wymaga przypisania użytkownika do grupy site `czskSite`; bez tego login się nie powiedzie.
- Checkout jest wielokrokowy B2B (nie standardowy B2C accelerator) — step validatory (`DefaultPaymentTypeCheckoutStepValidator`, `DefaultDeliveryAddressCheckoutStepValidator` itd.) muszą przejść przed przejściem do kolejnego kroku.
