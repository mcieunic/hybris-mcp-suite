# sniezkacore

## Cel
Centralny extension domenowy projektu Śnieżka — definiuje model danych, serwisy, strategie i procesy biznesowe dla B2B/B2C e-commerce (zamówienia, reklamacje, faktury, promocje, integracje ERP).

## Charakter
core

## Kluczowe items

### Nowe typy
- `LogisticalMinimum` — minimum logistyczne przypisane do B2BUnit (kwota/ilość wymagana do złożenia zamówienia)
- `Invoice` — faktura synchronizowana z ERP (IFS/C4C), z polami status (`InvoiceStatus`), typ (`InvoiceType`, `LogitoInvoiceType`)
- `InvoiceNotification` / `InvoiceNotificationProcess` / `InvoiceNotificationCronJob` — mechanizm powiadamiania grup użytkowników o nowych fakturach
- `CustomConfiguration` — tabela klucz-wartość do konfiguracji aplikacyjnej (zastępnik `project.properties` dla danych zmienianych runtime)
- `MessageBundle` — zlokalizowane komunikaty zarządzane w Backoffice (per klucz, per język)
- `SeoUrl` — przekierowania/forwardowania URL per site; obsługuje REDIRECT i FORWARD
- `ProductDocument` — dokument PDF przypisany do produktu lub zestawu; catalog-aware (sync)
- `ProductSet` / `ProductSetFamily` — zestawy produktów (np. farba + grunt) z przelicznikiem efektywności i hard-ratio
- `ColorGroup` / `MixerColorGroup` / `MixerColor` — grupy kolorów do nawigacji produktowej i konfiguratora mieszalnika
- `QualitativeComplaint` / `QuantitativeComplaint` — reklamacje jakościowe i ilościowe z osobnymi pozycjami (`QualitativeComplainedProduct`, `QuantitativeComplainedProduct`)
- `Opportunity` / `Signature` / `SignatureToSent` — szanse sprzedażowe (CRM) z obsługą kontraktów i podpisów
- `Teaser` (ContentPage extension) — powiązanie stron treści porad/inspiracji z produktami i filtrami (RoomType, ColorGroup, GroundPreparationType, DecorativeEffectType, ProductType, JobType)
- `ForwardingAgent` — przewoźnik (spedytor) przypisywany do DeliveryMode
- `BankTransferDetails` — dane do przelewu bankowego per zamówienie
- `SaveCartProcess` / `SaveCartEntry` — proces zapisu koszyka z pliku XLS
- `ExternalPaymentInfo extends PaymentInfo` — informacje o płatności online (transactionId, paymentId, status)
- `UnclearedDocumentPaymentInfo` — zapis historii płatności nierozliczonych dokumentów
- `Promo2B2BUnit` — powiązanie kodu promocji z B2BUnit (ograniczenie zasięgu promocji)
- `UserGroupB2BUnit` — mapowanie grup użytkowników na jednostki B2B do zarządzania dostępem
- `ASMAdminRestriction extends AbstractRestriction` — restrykcja CMS dla trybu ASM
- `CmsUserUnitGroupsRestriction` — restrykcja CMS ograniczająca widoczność treści do konkretnych grup i jednostek

### Rozszerzenia istniejących typów (autocreate=false)
- `AbstractOrder` (+24 atrybuty): ifsId, plannedRealizationDate, priceType, selectedDistributor, selectedPsbWarehouse, selfOrder, totalGrossWeight, totalPalletCount, customDeliveryAddress, adrLicenceRequired, nonExceededLogisticalMinimum itp.
- `Order`: trackingId, providerId, referenceNumber (dynamic), cannotCancel
- `Cart`: hash (unique idx), priceUpdated, productRemoved, plannedDate
- `AbstractRule`: promotionSystem (lista systemów ERP/Commerce), oncePerB2BUnit, productMessage
- `B2BUnit`: type (`B2BUnitType`), rozbudowane relacje ship-to/bill-to/sold-to/warehouse, stockDistributors, psbWarehouses, chainMembers, logisticalMinimums, currencies
- `Product`: navProducts (nawigacja), productDocuments, colorGroup, salesTag, mixerColorGroups, hiddenOnCMSSites, parentProducts

(+N więcej drobniejszych rozszerzeń)

## Services / Facades / DAO / Strategy

| Interface | Kind | Implementacja (pakiet) | Co robi |
|---|---|---|---|
| `ExtendedB2BCommerceCartService` | Service | `pl.sniezka.core.services` | Rozszerzony serwis koszyka B2B (logistical minimum, split cart) |
| `ExtendedOrderService` | Service | `pl.sniezka.core.services` | Rozszerzony serwis zamówień (IFS statusy, anulowanie) |
| `ExtendedCustomerAccountService` | Service | `pl.sniezka.core.services.customer` | Rozszerzona obsługa konta klienta B2B/B2C |
| `ExtendedB2BUnitService` | Service | `pl.sniezka.core.services` | Operacje na B2BUnit (dystrybutorzy, PSB, chain) |
| `InvoiceService` / `InvoiceDao` | Service/DAO | `pl.sniezka.core.services` | Pobieranie i zarządzanie fakturami z ERP |
| `InvoiceNotificationService` | Service | `pl.sniezka.core.invoicenotification.services` | Wysyłka powiadomień e-mail o nowych fakturach |
| `ComplaintService` / `QualitativeComplaintService` / `QuantitativeComplaintService` | Service | `pl.sniezka.core.services.complaints` | Obsługa reklamacji jakościowych i ilościowych |
| `OnlinePaymentService` | Service | `pl.sniezka.core.services.payment` | Integracja z bramką płatności online |
| `BonusService` / `BonusDao` | Service/DAO | `pl.sniezka.core.services.bonus` | Zarządzanie bonusami B2B |
| `AssetsService` | Service | `pl.sniezka.core.services` | Pobieranie zainstalowanych baz (installed base) z C4C |
| `CreditLimitsService` | Service | `pl.sniezka.core.services` | Limity kredytowe klientów (nierozliczone dokumenty) |
| `ProductSetService` / `ProductSetDao` | Service/DAO | `pl.sniezka.core.services` | Operacje na zestawach produktów |
| `InspirationAdviceSearchService` / `SetsListSearchService` | Service | `pl.sniezka.core.services.search` | Solr search dla inspiracji, porad i zestawów |
| `ClosedShopStrategy` | Strategy | `pl.sniezka.core.strategies.closedShop` | Strategia blokady sklepu (technical break) |
| `LogisticalMinimumValidationStrategy` | Strategy | `pl.sniezka.core.strategies` | Walidacja minimalnej wartości/ilości zamówienia |
| `SupportedDeliveryModesStrategy` / `DeliveryModeSupportStrategy` | Strategy | `pl.sniezka.core.strategies` | Filtrowanie dostępnych metod dostawy |
| `OnlinePaymentStrategy` | Strategy | `pl.sniezka.core.strategies.payment` | Strategia wyboru bramki płatności |
| `CustomConfigurationService` | Service | `pl.sniezka.core.configuration.service` | Odczyt/zapis `CustomConfiguration` (runtime config) |
| `ScriptConfigurationService` | Service | `pl.sniezka.core.services` | Konfiguracja skryptów (np. eksport) |
| `BaseLinkerService` | Service | `pl.sniezka.core.baselinker` | Integracja z platformą BaseLinker (zamówienia Allegro) |

## Spring beany worth knowing

- `baseLinkerService` (`pl.sniezka.core.baselinker.BaseLinkerService`) — obsługa zamówień przychodzących z Allegro przez BaseLinker REST API
- `allegroSiteChannelValidationStrategy` — nadpisuje OOTB `siteChannelValidationStrategy`, dodaje kanał `ALLEGRO`
- `volumeAwareProductPriceValueProvider` — Solr provider cen uwzględniający ceny progowe (volume pricing)
- `customCsrfOutboundRequestDecorator` — nadpisuje OOTB `csrfOutboundRequestDecorator` dla OutboundServices (integracje wychodzące)
- `colorNameValueProvider` / `colorCodeValueProvider` / `capacityValueProvider` — Solr field providers specyficzne dla Śnieżki (kolor, pojemność)
- `selectedParamsValueProvider` — Solr provider dla wybranych parametrów produktu
- `acceleratorCoreSystemSetup` — `CoreSystemSetup` inicjalizujący dane systemowe
- `abstractB2BOrderApproversFinder` — abstrakcyjna baza dla strategii znajdowania approverów zamówień B2B
- `UsedPromoLimitTypeQuantityStrategy` — strategia ograniczania ilości użyć promocji per B2BUnit

## Entry points

- **REST OCC:** brak (extension jest `core`; OCC jest w osobnym extension)
- **Controllers:** brak (brak katalogu `web/`)
- **CronJoby:**
  - `BonusJobPerformable` — obliczanie bonusów B2B
  - `EkomiProductFeedbackPerformable` — eksport opinii produktowych do Ekomi
  - `EmailReportPerformable` — generowanie i wysyłka raportów XLS e-mailem
  - `ExportCustomersJobPerformable` — eksport danych klientów
  - `OpportunityCreatedReminderPerformable` — przypomnienia o szansach sprzedaży
  - `ProductVariantFixPerformable` — naprawa wariantów produktów
  - `RecalculateCartPerformable` — przeliczanie zapisanych koszyków (ceny, dostępność)
  - `SendInvoiceNotificationsPerformable` — wysyłka powiadomień o fakturach
  - `UndeployInactivePromotionsPerformable` — deaktywacja nieaktywnych promocji w Rule Engine
  - `UpdateCustomerInfosForOrderJobPerformable` — aktualizacja danych klienta na zamówieniach
  - `RemoveDuplicatePricesPerformable` / `QuoteExpiredJobPerformable` / `QuoteToExpireSoonJobPerformable`
- **Business processes:** (resources/sniezkacore/processes/)
  - Kompletny zestaw procesów e-mail: rejestracja, reset hasła, potwierdzenie zamówienia B2B/B2C/PSB, zmiana statusu, anulowanie, zwrot, reklamacja, oferta (quote), faktura, szansa sprzedaży, palet return, dostępność
  - `saveCartProcess.xml` — proces zapisu koszyka z pliku
  - `mergeCartsProcess.xml` — łączenie koszyków
  - `allegroOrderStatusChangedProcess.xml` — zmiana statusu zamówienia Allegro
- **Interceptors:** `AllegroOrderValidateInterceptor`, `B2BCustomerValidateInterceptor`, `CustomCustomerInterceptor`, `UpdateOrderStatusPrepareInterceptor`, `TeaserPrepareInterceptor`, `CustomerReviewPrepareInterceptor`
- **Event listeners:** pełne pokrycie eventów: zamówienia, quote, rejestracja, reklamacje, dostępność, role klienta, usunięcie konta, ASM

## Dependencies

- **requires-extension:** `cms2`, `acceleratorcms`, `solrserver`, `couponservices`, `b2bacceleratorservices`, `b2bcommerce`, `commerceservices`, `commercefacades`, `y2ysync`, `sniezkaintegrationapi`, `b2bapprovalprocess`, `sapymktclickstream`, `ruleengineservices`, `sapcustomerb2c`, `adaptivesearch`, `adaptivesearchsolr`, `assistedserviceservices`, `outboundservices`
- **external libs:** brak pliku `external-dependencies.xml` z niestandardowymi bibliotekami

## Pułapki / gotchas

- `AbstractOrder` ma własne pole `priceType` (`DISTRIBUTOR`/`CLIENT`/`PSB`) — przy tworzeniu zamówień B2B trzeba je ustawić, inaczej kalkulacje cenowe mogą działać niepoprawnie.
- `LogisticalMinimum` jest walidowane przez `LogisticalMinimumValidationStrategy` przed złożeniem zamówienia; jeśli walidacja odrzuci koszyk, `nonExceededLogisticalMinimumSet` na `AbstractOrder` zawiera listę niespełnionych minimów — przydatne przy debugowaniu.
- `CustomConfiguration` nadpisuje wartości z `project.properties` w runtime — zmiany w `project.properties` nie zadziałają jeśli klucz istnieje w tej tabeli.
- `SeoUrl` obsługuje zarówno REDIRECT (HTTP 301/302) jak i FORWARD (wewnętrzny) — typ sterowany przez `DispatchingTypeEnum`; brak unikalnego indeksu na `technicalUrl` (zakomentowany), co może powodować duplikaty.
- `BaseLinkerService` używa własnego `ProxyHttpClient` — jeśli środowisko wymaga proxy, konfiguracja jest w tym beanie, nie w globalnym restTemplate.
- `allegroSiteChannelValidationStrategy` nadpisuje globalny alias — każde środowisko bez kanału Allegro musi sprawdzić, czy ta zmiana nie wpływa na inne site'y.
