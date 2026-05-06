# sniezkaticketingc4cintegration

## Cel

Integracja systemu ticketingowego Hybris z SAP Cloud for Customer (C4C). Obsługuje zgłoszenia supportowe, reklamacje jakościowe i ilościowe, zwroty palet oraz anonimowe zgłoszenia. Tickety tworzone w storefront są przesyłane do C4C via `TicketGateway`; statusy i notatki są czytane z C4C przy każdym pobraniu szczegółów ticketu.

## Charakter

Rozszerzenie czysto serwisowe — brak nowych typów CMS, brak impexów. Nadpisuje i dekoruje beany z rozszerzenia platformowego `customerticketingc4cintegration`. Posiada tryb **mock** (flaga `tickets.mock.enabled`), w którym zamiast wywoływać C4C dane są zapisywane do modelu `MockTicket` w bazie Hybris.

## Dependencies

- `customerticketingc4cintegration` — klasy bazowe C4CTicketFacadeImpl, C4C2YTicketEventsPopulator, TicketGateway
- `sniezkacore` — CustomConfigurationService, TicketPropertiesMapper, ExtendedCMSSiteService, TicketAttachmentInfoDao, modele QualitativeComplaintModel / QuantitativeComplaintModel

## Kluczowe items

Brak własnych `items.xml` — rozszerzenie nie definiuje nowych typów Hybris (oprócz `MockTicket`, który jest generowany przez jalo). Kluczowe DTO/modele pochodzą z `sniezkacore` i `customerticketingfacades`:

| Obiekt | Rola |
|--------|------|
| `TicketData` | zgłoszenie supportowe (Hybris DTO) |
| `ServiceRequestData` | reprezentacja ticketa po stronie C4C |
| `QualitativeComplaintData` / `QuantitativeComplaintData` | DTO formularzy reklamacji |
| `ReturnPalletData` | DTO zwrotu palet |
| `TicketAttachmentInfoModel` | śledzi stan asynchronicznego wysyłania załączników |
| `MockTicketModel` | przechowuje tickety w trybie mock |

Mapowania statusów i kategorii (Hybris ↔ C4C) — delegowane do `TicketPropertiesMapper` z `sniezkacore`, konfigurowanego przez `CustomConfigurationService` (properties w HAC).

## Beans (DTO/SOAP)

Z `sniezkaintegrationapi`:

- `CreateTicketRequestBean` / `CreateTicketResponseBean` — żądanie/odpowiedź tworzenia ticketa
- `AddTicketDescriptionBean` — dodanie opisu do istniejącego ticketa
- `AddAttachmentBean` / `AttachmentRequestData` / `AttachmentResponseData` — operacje na załącznikach
- `UpdateTicketRequestData` — aktualizacja ticketa (nowa wiadomość)
- `TicketPaginationData` / `TicketListData` — paginacja listy ticketów

## Services / Facades / Strategies

### Facade

`CustomC4CTicketFacadeImpl` (`customC4cTicketFacadeImpl`) — główna fasada, aliasuje `defaultTicketFacade`. Rozszerza `C4CTicketFacadeImpl`. Deleguje każdy typ ticketa do właściwego `GenericTicketService<T>`. Zarządza dostępnymi kategoriami (mapa per rola użytkownika: basic, anonymous, B2BContractManager, B2BOperating, B2BManager). Przy reklamacji ilościowej z `deliveryNoteId` automatycznie odrzuca notę dostawy przez `DeliveryNoteService`.

`CustomTicketFacadeFactory` — fabryka wybierająca między fasadą C4C a fasadą mock na podstawie konfiguracji.

### Ticket Services (GenericTicketService\<T\>)

| Bean | Klasa | Typ ticketa |
|------|-------|-------------|
| `supportTicketService` | `SupportTicketServiceImpl` | zgłoszenie supportowe |
| `palletReturnTicketService` | `PalletReturnTicketServiceImpl` | zwrot palet |
| `qualitativeComplaintTicketService` | `QualitativeComplaintTicketServiceImpl` | reklamacja jakościowa |
| `quantitativeComplaintServiceTicket` | `QuantitativeComplaintServiceTicketImpl` | reklamacja ilościowa |

Odpowiedniki mock: `mockSupportTicketService`, `mockPalletReturnTicketService`, `mockQualitativeComplaintTicketService`, `mockQuantitativeComplaintServiceTicket`.

### CreateTicketService

`AbstractCreateTicketService` — buduje `CreateTicketRequestBean` z danych Hybris. Dwie implementacje:

- `CreateB2BTicketServiceImpl` — resolvuje `customerId` i `contactPersonId` z `B2BUnitModel.c4cId` / `B2BCustomerModel.c4cId`
- `CreateB2CTicketServiceImpl` — wersja B2C (inne pobieranie danych klienta)

### Strategie filtrów (FilterStrategy)

`AbstractFilterStrategy` — buduje filtr OData do zapytań listy ticketów. Implementacje:

- `TicketFilter` — filtry dla zwykłych ticketów supportowych
- `ReturnPalletsFilter` — filtry zwrotów palet
- `B2BComplaintFilter` / `B2CComplaintFilter` — filtry reklamacji per kontekst

### Strategie pobierania załączników

- `HttpTicketAttachmentDownloadStrategy` — pobieranie przez HTTP (domyślna, używana w `abstractGenericTicketService`)
- `SoapTicketAttachmentDownloadStrategy` — pobieranie przez SOAP/TicketGateway (dostępna jako bean `soapTicketAttachmentDownloadStrategy`, niezarejestrowana domyślnie)

### Konwertery reklamacji (XML)

`QualitativeComplaintConverter` / `QuantitativeComplaintConverter` (bean `qualitativeComplaintXmlConverter` / `quantitativeComplaintXmlConverter`) — konwertują DTO reklamacji do obiektów Java reprezentujących strukturę XML formularza. Używane przez `ComplaintAttachmentService` do generowania pliku XML dołączanego do ticketa.

## Spring beany

Kluczowe aliasy i overrides w `sniezkaticketingc4cintegration-spring.xml`:

| Alias/bean | Wskazuje na |
|------------|-------------|
| `defaultTicketFacade` | `customC4cTicketFacadeImpl` |
| `c4cTicketService` | `c4CTicketService` (ServiceTicketCollectionImpl) |
| `customValidTransitions` | `customC4cValidTransitions` |
| `c4cTicketEventConverter` | `defaultC4CTicketEventConverter` |

Populatory dodawane przez `modifyPopulatorList`:
- `customc4cB2BTicketPopulator` → `c4cTicketConverter` (Y→C4C)
- `customC4C2YTicketPopulator` → `defaultTicketConverter` (C4C→Y)
- `customY2TicketMessageUpdatePopulator` → `updateMessageConverter`
- `customY2C4CTicketPopulator` → `defaultC4CTicketConverter`

Kategorie ticketów (listy Spring):
- `supportedTicketsCategoriesList`: ORDER_PLACEMENT, ORDER_INFO, PRODUCT_INFO, TECHNICALSUPPORT, QUALITATIVE_COMPLAINT_STATUS, QUANTITATIVE_COMPLAINT_STATUS, B2BCONTRACTMANAGERGROUP_EDIT, OTHER
- `supportedAnonymousUserTicketsCategoriesList`: LOGIN, DOMESTIC_SALES, FOREIGN_SALES, OTHER_ANONYMOUS
- `b2bcontractmanagergroupCategories`: CHANGE_PAYMENT, EXPOSITION_EVALUATION
- `b2boperatinggroupCategories`: CHANGE_PAYMENT
- `b2bmanagergroupCategories`: EXPOSITION_EVALUATION

Kategoria `EXPOSITION_EVALUATION` jest dodatkowo ograniczona do B2BUnit z grupą DST_HURT / DST_DETAL / DST_HURT_DETAL / DST_ADM (mapa `categoriesRequiresB2BUnitGroup`).

## Flow wymiany z C4C

### Utworzenie ticketa (supportowego)

1. `CustomC4CTicketFacadeImpl.createTicket()` → `SupportTicketServiceImpl.createTicket()`
2. `CreateTicketService.createTicketRequest()` → buduje `CreateTicketRequestBean` (customerId, contactPersonId, kategoria, processingTypeCode)
3. `AbstractGenericTicketService.createNewTicket()` → `TicketGateway.createTicket()` → C4C zwraca objectId + id
4. `CreateTicketService.createTicketDescription()` → `TicketGateway.addTicketDescription()` — dodanie treści wiadomości
5. Jeśli są załączniki: `TicketAttachmentSender.sendStandardAttachments()` (sync lub async, flaga `ticket.attachment.async.send`) → `TicketGateway.addTicketAttachment()` lub `addTicketAttachmentAsync()`
6. `TicketUtils.createTicketAttachmentInfo()` — zapis `TicketAttachmentInfoModel` do śledzenia stanu

### Utworzenie reklamacji jakościowej

Jak wyżej, plus:
- Konwersja DTO → `QualitativeComplaintModel` i zapis do bazy Hybris
- Wygenerowanie XML z danych formularza → `TicketGateway.addTicketAttachment()` (synchronicznie, jako osobny attachment z typeCode z `ticket.attachment.complaint.xml.code`)
- Na końcu `getTicket()` zwraca pełny `TicketData` pobrany z C4C

### Sync statusów

- Przy każdym `getTicket()` lub `getTickets()` dane pobierane są z C4C przez `TicketGateway`
- `CustomC4C2YTicketPopulator.populateTicketStatus()` mapuje `statusCode` C4C → `StatusData` Hybris przez `TicketPropertiesMapper`
- `CustomC4C2YTicketEventsPopulator` mapuje notatki C4C → `TicketEventData`; notatki od użytkownika C4C o nazwie `OData User` (konfigurowalna przez `supporttickets.history.agent.name`) traktowane jako wiadomości agenta
- Dostępne przejścia statusów: OPEN → {INPROCESS, COMPLETED}, INPROCESS → {COMPLETED}, COMPLETED → {OPEN, INPROCESS}

### Sprawdzanie stanu wysyłki załączników

Przy `getTicket()`: jeśli istnieje `TicketAttachmentInfoModel` dla danego objectID, porównuje liczbę załączników w C4C z oczekiwaną. Jeśli wszystkie dotarły — usuwa model. Jeśli minął czas `ticket.attachment.max.send.time.minutes` (domyślnie 10 min) — usuwa model bez względu na stan. W przeciwnym razie ustawia `ticket.missingAttachments`.

### Pobieranie załączników

`HttpTicketAttachmentDownloadStrategy.downloadAttachment()` — pobiera plik przez HTTP z C4C i zapisuje do `HttpServletResponse`. Alternatywna strategia SOAP (`SoapTicketAttachmentDownloadStrategy`) pobiera przez `TicketGateway.getAttachment()`.

## Pułapki / gotchas

- **`ExternalContactID` i `ExternalCustomerID` muszą być `null`** w `ServiceRequestData` przy wysyłaniu do C4C — inaczej C4C zwraca HTTP 500. Wymuszane w `CustomY2C4CB2BTicketPopulator`.
- Tryb mock jest kontrolowany przez `CustomTicketFacadeFactory` na podstawie flagi `tickets.mock.enabled`. Zmiana w runtime wymaga restartu kontekstu Spring (bean singleton).
- Wysyłanie załączników jest asynchroniczne gdy `ticket.attachment.async.send=true` — brak gwarancji dostarczenia przy błędach sieciowych; model `TicketAttachmentInfoModel` umożliwia monitorowanie, ale nie retry.
- Czas oczekiwania na załączniki (`ticket.attachment.max.send.time.minutes`) jest globalny — po jego upłynięciu info jest usuwane i front nie będzie sygnalizował brakujących załączników.
- Domyślny język notatek w `updateNotes()`: hardkodowane `"PL"` jako fallback, gdy nie ma sesji językowej.
- Kategoria `EXPOSITION_EVALUATION` widoczna tylko dla B2BUnit z odpowiednimi grupami — filtrowanie po stronie Hybris, nie C4C.
- `QualitativeComplaintModel` jest zapisywany do bazy Hybris (oprócz wysyłki do C4C) — dane formularza reklamacji są w obu systemach.
