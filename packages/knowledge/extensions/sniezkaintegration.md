# sniezkaintegration

## Cel
Rozszerzenie integracyjne łączące SAP Commerce z zewnętrznymi systemami backendowymi: SAP S/4HANA (zamówienia, płatności), SAP C4C (kontakty, tickety, pracownicy, szanse sprzedaży), IFS (faktury, awiza), CAR (raporty, limity kredytowe, kursy walut, POS), PSB (zamówienia), GUS (dane podatnika) oraz SAP Marketing Cloud (zgody). Komunikacja opiera się na Spring Integration (kanały, gateway, transformery) i SOAP/WS.

## Charakter

| Cecha | Wartość |
|---|---|
| Typ | Rozszerzenie integracyjne (middleware) |
| Wzorzec | Spring Integration — gateway → transformer → outbound WS gateway |
| Protokół komunikacji | SOAP (JAXB marshalling), REST (ScpiWebService + OAuth2 przez SCPI) |
| Uwierzytelnianie | Basic Auth (`BasicAuthenticationMessageSender`) lub OAuth2 (SCPI) |
| Moduł webowy | `/sniezkaintegration` — Spring MVC + Spring Security (własny config) |
| Items własne | Brak (items.xml pusty) |

## Dependencies

- `sniezkacore`
- `b2bcommerce`
- `sniezkaintegrationapi` (interfejsy gateway i DTO)
- `sniezkasaporderexchangeb2b`

## Kluczowe items

Rozszerzenie nie definiuje własnych typów w `items.xml`. Korzysta z typów platformy i rozszerzeń nadrzędnych. Jedynym własnym elementem infrastrukturalnym są generatory kluczy:

| Bean | Klasa | Opis |
|---|---|---|
| `idocDOCNUMGenerator` | `PersistentKeyGenerator` | Generator numerów IDoc do SAP S/4 |
| `unclearedDocsPaymentGenerator` | `PersistentKeyGenerator` | Generator numerów płatności dla nierozliczonych dokumentów |

## Services / Facades / Strategies

| Klasa | Pakiet | Rola |
|---|---|---|
| `SendOrderToSAPPOService` | `order.service` | Wysyłka zamówienia do S/4 przez SOAP |
| `SendOrderToDataHubService` | `order.service` | Wysyłka zamówienia przez DataHub (alternatywna ścieżka) |
| `ScpiWebService` | `scpi` | Wywołania REST przez SAP Cloud Platform Integration (OAuth2) |
| `ScpiIntegrationOAuth2RestTemplateCreator` | `scpi` | Tworzenie RestTemplate z tokenem OAuth2 dla SCPI |
| `BasicAuthenticationMessageSender` | `common.sender` | Reużywalny sender WS z Basic Auth |
| `ExceptionTransformer` | `common.transformer` | Obsługa błędów na `defaultErrorChannel` |
| `TicketValidator` | `tickets.validators` | Walidacja danych ticketów (C4C) |
| `PaymentInfoS4Filter` | `paymentinfos4` | Filtr wiadomości przed wysyłką info płatniczego do S/4 |

## Spring beany (selektywnie)

| Bean | Klasa | Plik |
|---|---|---|
| `createOrderJob` | `CreateOrdersPerformable` | sniezkaintegration-spring.xml |
| `baselinkerOrdersImportJob` | `BaselinkerOrdersImportPerfomable` | sniezkaintegration-spring.xml |
| `baselinkerOrdersReImportJob` | `BaselinkerOrdersReImportPerfomable` | sniezkaintegration-spring.xml |
| `baselinkerProductInitialLoadJob` | `BaselinkerProductInitialLoadPerfomable` | sniezkaintegration-spring.xml |
| `baselinkerProductDeltaJob` | `BaselinkerProductDeltaPerfomable` | sniezkaintegration-spring.xml |
| `baselinkerProductFullDeltaJob` | `BaselinkerProductFullDeltaPerfomable` | sniezkaintegration-spring.xml |
| `baselinkerUpdateStocksJob` | `BaselinkerUpdateStocksPerfomable` | sniezkaintegration-spring.xml |
| `hyMarketingConsentPerformable` | `HyMarketingConsentPerformable` | sniezkaintegration-spring.xml |
| `hyMarketingPopulatingPerformable` | `HyMarketingPopulatingPerformable` | sniezkaintegration-spring.xml |
| `sapRetailPopulatingPerformable` | `SapRetailPopulatingPerformable` | sniezkaintegration-spring.xml |
| `c4cEmployeeUpdatePerformable` | `C4CEmployeeUpdatePerformable` | sniezkaintegration-spring.xml |
| `asmNameUpdatePerformable` | `AsmNameUpdatePerformable` | sniezkaintegration-spring.xml |
| `posSynchronizationPerformable` | `POSSynchronizationPerformable` | sniezkaintegration-spring.xml |
| `sentSignaturesToC4CPerformable` | `SentSignaturesToC4CPerformable` | sniezkaintegration-spring.xml |
| `removeSentSignaturesPerformable` | `RemoveSentSignaturesPerformable` | sniezkaintegration-spring.xml |
| `removeOutdatedPriceRowsPerformable` | `RemoveOutdatedPriceRowsPerformable` | sniezkaintegration-spring.xml |
| `currencyUpdateJobPerfomable` | `CurrencyUpdateJobPerfomable` | sniezkaintegration-spring.xml |
| `navigationCategoryJobPerformable` | `NavigationCategoryJobPerformable` | sniezkaintegration-spring.xml |
| `loggingInterceptor` | `LoggingInterceptor` | sniezkaintegration-spring.xml |
| `fileLoggingInterceptor` | `FileLoggingInterceptor` | sniezkaintegration-spring.xml |
| `timeInvocationInterceptor` | `TimeInvocationInterceptor` | sniezkaintegration-spring.xml |
| `scpiIntegrationOAuth2RestTemplateCreator` | `ScpiIntegrationOAuth2RestTemplateCreator` | sniezkaintegration-spring.xml |

## Entry points

### Inbound channels (wywołania z kodu aplikacji przez gateway)

Wszystkie gateway'e są wywoływane synchronicznie z warstwy serwisowej/fasadowej przez interfejsy z `sniezkaintegrationapi`:

| Gateway bean | Interfejs | Metody |
|---|---|---|
| `orderGateway` | `OrderGateway` | `createOrder` (router PSB vs S/4 po `priceType`) |
| `paymentInfoS4Gateway` | `PaymentInfoS4Gateway` | `sendOrderPaymentInfo`, `sendUnclearedDocumentPaymentInfo` |
| `invoicesGateway` | `InvoicesGateway` | `getInvoiceList`, `acceptInvoice` |
| `deliveryNotesGateway` | `DeliveryNotesGateway` | `getDeliveryNoteList`, `acceptDeliveryNote` |
| `creditLimitsGateway` | `CreditLimitsGateway` | `getCreditReport`, `getUnclearedDocumentsList` |
| `consentGateway` | `ConsentGateway` | `getConsentsForCustomer`, `setConsentStates`, `setConsentStatesForNewsletter` |
| `manageContactsGateway` | `ManageContactsGateway` | `createOrUpdateUser`, `disableUser` |
| `b2BUnitRegistrationGateway` | `B2BUnitRegistrationGateway` | `registerB2BUnit`, `registerSzansa`, `getB2BUnitUid` |
| `opportunityGateway` | `OpportunityGateway` | `sendSignature` |
| `ticketsGateway` | `TicketsGateway` | CRUD ticketów i załączników |
| `employeeGateway` | `EmployeeGateway` | `getEmployeeDetails` |
| `assetsGateway` | `AssetsGateway` | assets klienta, szczegóły, installed bases |
| `gusGateway` | `GusGateway` | wyszukiwanie danych firmy po NIP |
| `dashboardReportGateway` | `DashboardReportGateway` | `getBestsellers`, `getBrandShares` |
| `logisticMinimumGateway` | `LogisticMinimumGateway` | `getLogisticMinimum` |
| `currencyGateway` | `CurrencyGateway` | `getCurrencyConversionRates` |
| `pointOfServiceGateway` | `PointOfServiceGateway` | `getPointOfServices` |

### Outbound channels (systemy zewnętrzne)

| System | Adapter | Protokół |
|---|---|---|
| SAP S/4HANA | `s4/createorder-sappo.xml` | SOAP (`SalesOrder` IDoc) |
| SAP S/4HANA | `s4/createpaymentinfo-sappo.xml` | REST przez SCPI + OAuth2 (`ACCDOCUMENT01` IDoc) |
| SAP C4C | `c4c/*.xml` | SOAP (OData-like, JAXB) |
| IFS | `ifs/*.xml` | SOAP |
| CAR | `car/*.xml` | SOAP |
| PSB | `psb/createorder.xml` | SOAP |
| GUS | `gus/*.xml` | SOAP (dwustopniowy: logon + searchQuery) |
| SAP Marketing Cloud | `conf.adapter.marketing/*.xml` | SOAP |

### Eventy / listenery

Brak własnych listenerów eventów Hybris. Integracje są wywoływane synchronicznie przez gateway lub asynchronicznie przez CronJoby.

### CronJoby (sync, retry, monitoring)

| Bean | Opis |
|---|---|
| `createOrderJob` | Wysyłka zamówień do SAP |
| `baselinkerOrdersImportJob` | Import zamówień z BaseLinker |
| `baselinkerOrdersReImportJob` | Ponowny import zamówień z BaseLinker |
| `baselinkerProductInitialLoadJob` | Inicjalny załadunek produktów do BaseLinker |
| `baselinkerProductDeltaJob` | Delta produktów do BaseLinker |
| `baselinkerProductFullDeltaJob` | Pełna delta produktów do BaseLinker |
| `baselinkerUpdateStocksJob` | Synchronizacja stanów magazynowych z BaseLinker |
| `hyMarketingConsentPerformable` | Synchronizacja zgód z SAP Marketing |
| `hyMarketingPopulatingPerformable` | Populowanie danych produktowych dla SAP Marketing |
| `sapRetailPopulatingPerformable` | Populowanie danych dla SAP Retail |
| `c4cEmployeeUpdatePerformable` | Aktualizacja danych pracowników z C4C |
| `asmNameUpdatePerformable` | Aktualizacja nazw agentów ASM |
| `posSynchronizationPerformable` | Synchronizacja punktów sprzedaży z CAR |
| `sentSignaturesToC4CPerformable` | Wysyłka podpisanych dokumentów do C4C |
| `removeSentSignaturesPerformable` | Czyszczenie wysłanych podpisów |
| `removeOutdatedPriceRowsPerformable` | Czyszczenie przestarzałych wierszy cennikowych |
| `currencyUpdateJobPerfomable` | Aktualizacja kursów walut z CAR |
| `navigationCategoryJobPerformable` | Synchronizacja kategorii nawigacyjnych |

## Pułapki / gotchas

- Zamówienia są routowane po polu `priceType`: wartość `PSB` kieruje do adaptera PSB, pozostałe — do S/4HANA przez SOAP.
- `paymentInfoS4Gateway` wysyła przez SCPI z OAuth2 (nie Basic Auth jak pozostałe) — wymaga skonfigurowanego `destinationService` (SAP BTP Destination).
- GUS wymaga dwóch kolejnych wywołań SOAP: najpierw `logon` (zwraca token sesji), potem `searchQuery` — token jest przekazywany przez nagłówek wiadomości Spring Integration.
- `fileLoggingInterceptor` loguje payload do pliku tylko gdy `tickets.attachment.logging.enabled=true` — domyślnie wyłączone ze względu na rozmiar załączników.
- Wszystkie outbound gateway'e używają `int-ws:outbound-gateway` z `encoding-mode="NONE"` — zmiana tego ustawienia może złamać kodowanie znaków specjalnych w SOAP.
- `defaultErrorChannel` przechwytuje wyjątki ze wszystkich gateway'ów i przepuszcza przez `ExceptionTransformer` — błędy nie są rethrowane automatycznie, należy sprawdzić logikę transformera przy nowych integracjach.
- `idocDOCNUMGenerator` generuje numery IDoc używane zarówno przy zamówieniach S/4, jak i przy płatnościach — konfiguracja `keygen.idocDOCNUM.*` musi być ustawiona przed pierwszym uruchomieniem.
- Rozszerzenie zawiera moduł web (`/sniezkaintegration`) z własnym Spring Security — nie ma kontrolerów REST, jest to prawdopodobnie legacy lub placeholder.

