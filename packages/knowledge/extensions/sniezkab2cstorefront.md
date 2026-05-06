# sniezkab2cstorefront

## Cel
Główny storefront B2C dla sklepu Śnieżka oparty na Spring MVC (accelerator). Obsługuje pełny cykl zakupowy klienta indywidualnego: przeglądanie katalogu, koszyk, wieloetapowy checkout (adres, metoda dostawy, płatność, podsumowanie), konto klienta, reklamacje, faktury i integracje zewnętrzne (GUS, bramka płatności). Rozszerzenie jest deployowane jako aplikacja webowa pod ścieżką `/sniezkab2cstorefront`.

## Charakter

| Typ | Rynek | Status |
|-----|-------|--------|
| storefront (web) | PL (B2C) | aktywne |

## Dependencies

- `acceleratorstorefrontcommons`
- `sniezkacommonweb`
- `sniezkafacades`
- `sniezkaticketingc4cintegration`
- `adaptivesearchsamplesaddon`
- `smarteditaddon`
- `assistedservicestorefront`
- `assistedservicepromotionaddon`
- `customerticketingaddon`
- `eventtrackingwsaddon`
- `sapymktrecommendationaddon`
- `hybrisanalyticsaddon`

## Kluczowe items

Brak — rozszerzenie nie definiuje własnych typów (`*-items.xml` jest pusty lub nieobecny).

## Services / Facades / Strategies

| Nazwa | Rodzaj | Pakiet | Po co |
|-------|--------|--------|-------|
| `CheckoutDeliveryModeProcessor` | Strategy (interfejs) | `pl.sniezka.storefront.strategies` | Przetwarza dane specyficzne dla danej metody dostawy podczas checkoutu |
| `CheckoutDeliveryModeViewStrategy` | Strategy (interfejs) | `pl.sniezka.storefront.strategies` | Decyduje o widoku dla danej metody dostawy |
| `CheckoutChooseAddressStrategy` | Strategy (interfejs) | `pl.sniezka.storefront.strategies.checkout.address` | Wybór adresu dostawy w checkoucie |
| `PolishPostCheckoutDeliveryModeProcessor` | Strategy | `pl.sniezka.storefront.strategies.impl` | Logika dostawy Poczta Polska |
| `PlanCourierCheckoutDeliveryModeProcessor` | Strategy | `pl.sniezka.storefront.strategies.impl` | Logika dostawy kurier Plan |
| `ExpressDHLCheckoutDeliveryModeProcessor` | Strategy | `pl.sniezka.storefront.strategies.impl` | Logika dostawy DHL Express |
| `EconomicLetterCheckoutDeliveryModeProcessor` | Strategy | `pl.sniezka.storefront.strategies.impl` | Logika dostawy list ekonomiczny |
| `PersonalPickupDeliveryModeProcessor` | Strategy | `pl.sniezka.storefront.strategies.impl` | Logika odbioru osobistego |
| `GuestCheckoutCartCleanStrategy` | Strategy (interfejs) | `pl.sniezka.storefront.security` | Czyszczenie koszyka gościa przy wyjściu z checkoutu |
| `B2CQualitativeComplaintUtils` | Util | `pl.sniezka.storefront.util.complaints` | Helper dla reklamacji jakościowych B2C |
| `B2CQuantitativeComplaintUtils` | Util | `pl.sniezka.storefront.util.complaints` | Helper dla reklamacji ilościowych B2C |
| `ExtendedPageTitleResolver` | Util | `pl.sniezka.storefront.util` | Rozszerzone tytułowanie stron (SEO) |
| `InvoiceFilterMapper` | Util | `pl.sniezka.storefront.util` | Mapowanie filtrów faktur |
| `RegisterDataUtil` | Util | `pl.sniezka.storefront.util` | Pomocnicze operacje na danych rejestracyjnych |

## Spring beany (selektywnie)

| id | Klasa | Po co |
|----|-------|-------|
| `acceleratorAuthenticationProvider` | `pl.sniezka.storefront.security.AcceleratorAuthenticationProvider` | Override OOTB: autentykacja użytkownika storefrontu |
| `defaultCMSLinkComponentRenderer` | `pl.sniezka.storefront.renderer.CMSLinkComponentRenderer` | Override OOTB: renderowanie linków CMS z obsługą SEO URL |
| `defaultImageMapComponentRenderer` | `pl.sniezka.storefront.renderer.ImageMapComponentRenderer` | Własny renderer komponentu mapy obrazkowej |
| `defaultRememberMeServices` | `pl.sniezka.storefront.security.AcceleratorRememberMeServices` | Override "pamiętaj mnie" |
| `loginAuthenticationFailureHandler` | `pl.sniezka.storefront.security.LoginAuthenticationFailureHandler` | Obsługa błędów logowania |
| `defaultAutoLoginStrategy` | `pl.sniezka.storefront.security.impl.DefaultAutoLoginStrategy` | Auto-login po rejestracji/checkoucie gościa |
| `guidCookieStrategy` | `pl.sniezka.storefront.security.impl.DefaultGUIDCookieStrategy` | Zarządzanie GUID cookie (bezpieczeństwo koszyka) |
| `defaultGuestCheckoutCartCleanStrategy` | `pl.sniezka.storefront.security.impl.DefaultGuestCheckoutCartCleanStrategy` | Czyszczenie koszyka gościa |
| `storefrontTenantFilterChain` | `pl.sniezka.commonweb.filters.UrlPathFilter` | Główny łańcuch filtrów; routing `/integration/` do osobnego łańcucha |
| `maintenanceBreakFilter` | `pl.sniezka.commonweb.filters.MaintenanceBreakFilter` | Przekierowanie na `/maintenance` gdy włączona przerwa techniczna |
| `urlEncoderFilter` | `pl.sniezka.storefront.filters.UrlEncoderFilter` | Obsługa URL z atrybutami sesji (język, waluta) |
| `anonymousCheckoutFilter` | `pl.sniezka.storefront.filters.AnonymousCheckoutFilter` | Wylogowanie gościa poza checkoutem |
| `cartRestorationFilter` | `pl.sniezka.storefront.filters.CartRestorationFilter` | Przywracanie koszyka z cookie |
| `logoutAsmCustomerFilter` | `pl.sniezka.storefront.filters.LogoutAsmCustomerFilter` | Wylogowanie klienta ASM |
| `extendedPageTitleResolver` | `pl.sniezka.storefront.util.ExtendedPageTitleResolver` | Override `pageTitleResolver` — rozszerzone tytuły stron |
| `defaultRequireHardLoginEvaluator` | `pl.sniezka.storefront.security.evaluator.impl.RequireHardLoginEvaluator` | Ocenia czy strona wymaga pełnego logowania |
| `seoUrlFilter` | `pl.sniezka.commonweb.filters.seo.SeoUrlFilter` | Translacja SEO URL-i |
| `sniezkaCalculatorProcessorStrategy` | `pl.sniezka.commonweb.strategies.calculators.processors.impl.SniezkaCalculatorProcessorStrategy` | Strategia procesora kalkulatora dla marki Śnieżka |
| `magnatCalculatorViewStrategy` | `pl.sniezka.commonweb.strategies.calculators.view.impl.MagnatCalculatorViewStrategy` | Strategia widoku kalkulatora dla marki Magnat |
| `vidaronCalculatorViewStrategy` | `pl.sniezka.commonweb.strategies.calculators.view.impl.VidaronCalculatorViewStrategy` | Strategia widoku kalkulatora dla marki Vidaron |

## Entry points

### Controllery

| URL | Controller | Opis |
|-----|-----------|------|
| `/` | `HomePageController` | Strona główna |
| `/login` | `LoginPageController` | Logowanie i rejestracja inline |
| `/register` | `RegisterPageController` | Rejestracja |
| `/search` | `SearchPageController` | Wyniki wyszukiwania |
| `/**/p` | `ProductPageController` | Strona produktu |
| `/**/s` | `ProductSetPageController` | Strona setu produktów |
| `/cart` | `CartPageController` | Koszyk |
| `/my-account` | `AccountPageController` | Panel konta klienta (zamówienia, adresy, hasło, konsenty, newslettery) |
| `/my-account/invoices` | `InvoicesPageController` | Lista faktur (wymaga logowania; tylko PL B2B klienci) |
| `/my-account/complaints/qualitative/**` | `B2CQualitativeComplaintController` | Reklamacje jakościowe B2C |
| `/my-account/complaints/quantitative/**` | `B2CQuantitativeComplaintController` | Reklamacje ilościowe B2C |
| `/checkout/multi/delivery-address` | `DeliveryAddressCheckoutStepController` | Krok checkoutu: adres |
| `/checkout/multi/delivery-method` | `DeliveryMethodCheckoutStepController` | Krok checkoutu: metoda dostawy |
| `/checkout/multi/payment-method` | `PaymentMethodCheckoutStepController` | Krok checkoutu: metoda płatności |
| `/checkout/multi/summary` | `SummaryCheckoutStepController` | Krok checkoutu: podsumowanie + złożenie zamówienia |
| `/checkout/orderPayment` | `OnlinePaymentController` | Obsługa przekierowania płatności online |
| `/newsletter` | `NewsletterController` | Zapis/wypisz newsletter |
| `/gus` | `GusIntegrationController` | Pobieranie danych firmy z GUS (po NIP) |
| `/import/csv/**` | `ImportCSVPageController` | Import produktów z pliku CSV do koszyka |
| `/maintenance` | `MaintenanceBreakPageController` | Strona przerwy technicznej |
| `MerchantCallbackController` | brak jawnego `@RequestMapping` — obsługuje `@PostMapping` | Callback od dostawcy płatności |

### Endpointy REST/OCC

Brak — rozszerzenie nie wystawia OCC API.

### CronJoby

Brak.

### Email procesy

Brak własnych — delegowanie do `acceleratorstorefrontcommons`.

## Pułapki / gotchas

- Łańcuch filtrów jest rozgałęziony: URL-e pod `/integration/` trafiają do `integrationTenantFilterChain` (bez Spring Security i wielu standardowych filtrów) — callbacki płatności i GUS działają bez uwierzytelnienia sesją.
- `maintenanceBreakFilter` konfigurowany przez klucz `maintenanceBreak` w `CustomConfigurationService` — zmiana wartości w Backoffice natychmiast przekierowuje ruch.
- `b2cAcceleratorSiteChannels` ustawia wyłącznie kanał `B2C` — jeśli BaseSite ma inny kanał, `CMSSiteFilter` zwróci błąd.
- Strategie dostawy (`CheckoutDeliveryModeProcessor` / `CheckoutDeliveryModeViewStrategy`) są rozszerzane przez dodanie nowej klasy — nie ma centralnego rejestru, implementacje wstrzykiwane są listą w kontrolerze checkoutu.
- Multipart upload jest włączony tylko dla wybranych URL-i (CSV import, załączniki do reklamacji) — inne endpointy nie obsłużą `multipart/form-data`.
- `InvoicesPageController` pod `/my-account/invoices` — widoczny dla wszystkich zalogowanych, ale dane faktur zwracane są tylko dla klientów z odpowiednim kontem w systemie ERP; brak jawnego guardu na poziomie serwisu może dawać puste listy zamiast błędu.

## Plik: extensions/sniezkab2cstorefront.md
