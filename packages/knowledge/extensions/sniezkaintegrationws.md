# sniezkaintegrationws

## Cel

Warstwa odbierająca wywołania z systemów zewnętrznych (C4C, SAP ERP/IFS) przez SOAP. Obsługuje replikację partnerów biznesowych, relacji, zamówień, szans sprzedaży oraz operacje na kuponach i impexach.

## Charakter

Rozszerzenie webowe (`-ws`). Wdraża się jako kontekst webowy pod `/sniezkaintegrationws`. Technologia: Spring-WS (`MessageDispatcherServlet`) — wszystkie endpointy to klasy `@Endpoint` z metodami `@PayloadRoot`. Brak REST; wyłącznie SOAP/XML.

## Dependencies

- `sniezkaintegrationapi` — wygenerowane klasy JAXB (WSDL → Java)
- `sniezkaintegration` — narzędzia wspólne (m.in. `LoggingHelper`)
- `couponservices` — generowanie kodów kuponów

## Kluczowe items

Brak własnych typów w `items.xml` (plik istnieje, jest pusty). Rozszerzenie operuje wyłącznie na modelach z `sniezkacore` i standardowych B2B.

## Beans (DTO/JAXB)

Brak własnych beanów generowanych przez `beans.xml`. DTOs pochodzą z `sniezkaintegrationapi` (generowane z WSDL):
- `com.sap.xi.a1s.global.*` — BusinessPartner, BusinessPartnerRelationship (C4C namespace `http://sap.com/xi/SAPGlobal20/Global`)
- `com.sniezka.urn.yc.opportunities.*` — OpportunityReplicationRequest (namespace `urn.sniezka.com:YC:Opportunities`)
- `generated.*` — DELVRY06, ORDERS05, ImpexImportRequest/Response, CouponGeneratorRequest/Response

## Services / Facades / Strategies

Endpointy wstrzykują bezpośrednio serwisy platformy i sniezkacore:

| Serwis | Zastosowanie |
|---|---|
| `ModelService` | zapis modeli |
| `ExtendedB2BUnitDao` | szukanie B2BUnit po c4cId |
| `B2BCustomerDao` | szukanie B2BCustomer po c4cId/uid |
| `UserService` | zarządzanie grupami użytkowników |
| `AddUserEmailService` | zdarzenia e-mail po utworzeniu/zmianie ról |
| `CustomConfigurationService` | mapowania (role codes, account types, chains) |
| `Europe1PriceFactory` | tworzenie UserPriceGroup |
| `B2BOrderService` | pobieranie zamówień po kodzie |
| `CancelOrderService` | ustawianie historii anulowania |
| `CouponCodeGenerationService` | generowanie kodów MultiCodeCoupon |
| `ImportService` + `MediaService` | import Impex z treści SOAP |
| `OpportunityDao` / `OpportunityService` | replikacja i notyfikacje szans sprzedaży |
| `UserGroupB2BUnitService` | zarządzanie powiązaniem group↔unit per klient |
| `B2BUnitRelationHelper` | helper: ship-to/bill-to/sold-to, role w jednostce |

## Spring beany

Konfiguracja w `spring-ws-config.xml` (ładowana przez `MessageDispatcherServlet`):

| Bean | Klasa |
|---|---|
| `LoggingInterceptor` | loguje każde żądanie/odpowiedź/fault |
| `ContextEndpointInterceptor` | ustawia tenant=`master`, user=`admin`, lang=`en` przed obsługą; czyści sesję po |
| `b2BUnitRelationHelper` | helper relacji B2BUnit |

Endpointy rejestrowane przez `@Endpoint` + component-scan `pl.sniezka.integrationws`.

WSDL udostępniane statycznie (`<ws:static-wsdl>`):
- `parenterReplicate` — `Replicate Business Partner to SAP Business Suite.wsdl`
- `parenterRelationshipReplicate` — `Replicate Business Partner Relationship to SAP Business Suite.wsdl`
- `b2BUnitRegistration` — `B2BUnitRegistrationRequest.wsdl`

## Endpointy (kluczowe!)

Wszystkie dostępne pod `/sniezkaintegrationws/webservice/*`.

| URL (relatywny do `/sniezkaintegrationws/webservice/`) | Endpoint (klasa / bean) | System wywołujący | Rola |
|---|---|---|---|
| `parenterReplicate` | `BusinessPartnerReplicate` | C4C | Replikacja B2BUnit i B2BCustomer; tworzy/aktualizuje jednostki B2B, przypisuje grupy, cenniki, adresy, NIPy; po zakończeniu wysyła e-mail do nowych klientów |
| `parenterRelationshipReplicate` | `BusinessPartnerRelationshipReplicate` | C4C | Replikacja relacji: przypisanie kontaktów do jednostek, hierarchia (chain, distributor, PSB warehouse), role B2B (admin, approver, invoices itd.); obsługa ASM Customer |
| `b2BUnitRegistration` | *(WSDL, endpoint do uzupełnienia)* | C4C | Rejestracja B2BUnit — WSDL zdefiniowany, brak dedykowanej klasy Java w src (obsługiwane przez BusinessPartnerReplicate lub do implementacji) |
| `webservice/` (localPart=`ORDERS05`) | `OrderStatusUpdateEndpoint` | SAP ERP (IDoc ORDERS05) | Aktualizacja statusu zamówienia: SUSPENDED, PAYMENT_AUTHORIZED, MISSING_PAYMENT, CANCELLED; ustawienie cannotCancel; oznaczanie anulowanych pozycji |
| `webservice/` (localPart=`DELVRY06`) | `OrderStatusUpdateEndpoint` | SAP ERP (IDoc DELVRY06) | Aktualizacja statusu dostawy: IN_REALIZATION, SCHEDULED_FOR_SHIPMENT, SCHEDULED_FOR_PICK_UP, SHIPPING, RECEIVED, INVOICED; zapis trackingId i providerId |
| `webservice/` (localPart=`OpportunityReplicationRequest`) | `OpportunityReplicateEndpoint` | C4C | Replikacja szans sprzedaży (kontrakty, podpisy); wysyła e-mail gdy status=SENT_TO_BP i forma dostawy=COMMERCE |
| `webservice/` (localPart=`coupon-generator-request`) | `MultiCodeCouponEndpoint` | wewnętrzny / CRM | Generowanie kodów dla MultiCodeCoupon; zwraca listę kodów w odpowiedzi SOAP |
| `webservice/` (localPart=`impex-import-request`) | `ImpexImportEndpoint` | narzędziowy | Import Impexa przekazanego jako string w treści SOAP; konfigurowalny tryb (strict/relaxed), distributed, legacyMode |

## Security

- HTTP Basic Auth (`<auth-method>BASIC</auth-method>`) przez `CoreAuthenticationProvider`.
- Wymagana rola: `ROLE_ADMINGROUP` lub `ROLE_INTEGRATIONADMINGROUP` (Spring Security intercept `/**`).
- Dozwolone typy użytkowników: `Employee` + grupy `Admingroup` / `integrationadmingroup`.
- Wymagany HTTPS (`requires-channel="https"`), CSRF wyłączony.
- WSDL (endpoint `/`) jest `PERMIT_ALL` — dostępny bez uwierzytelnienia.
- Plik `sniezkaintegrationws-spring-security-config.xml` zawiera zakomentowaną alternatywną konfigurację (`security="none"`) — historycznie security było wyłączone, aktualnie jest włączone.
- Po uwierzytelnieniu HTTP `ContextEndpointInterceptor` ustawia sesję Hybris na user=`admin`, tenant=`master` — rzeczywista autoryzacja logiki dzieje się po stronie tej konfiguracji Spring Security, nie Hybris-perms.

## Pułapki / gotchas

- **Brak walidacji właściwej** — endpointy tylko logują błędy i kontynuują pętlę; jeden błędny BusinessPartner nie przerywa całego batcha.
- **Admin session hardcoded** — `ContextEndpointInterceptor` zawsze loguje jako `admin`; oznacza to, że wszystkie operacje wykonują się z pełnymi uprawnieniami platformy.
- **ASM Customer duality** — `BusinessPartnerRelationshipReplicate` tworzy równolegle aktywnego ASM Customer i nieaktywnego zwykłego Customer lub odwrotnie; kolejność przychodzącej wiadomości (BPReplicate vs BPRelationshipReplicate) determinuje który model powstaje pierwszy.
- **Emaile `@tmp.com`** — nowo tworzony klient bez e-maila dostaje adres `<c4cId>@tmp.com`; e-mail powitalny jest blokowany dla takich adresów.
- **`removeAllRoles` feature flag** — zachowanie `BusinessPartnerRelationshipReplicate` zmienia się pod kluczem `businessPartnerRelationshipReplicate.removeAllRoles`; bez znajomości tej flagi logika wygląda niekonsekwentnie.
- **ImpexImportEndpoint bez auth na poziomie logiki** — każdy kto ma ROLE_INTEGRATIONADMINGROUP może wykonać dowolny Impex; brak sandboxu.
- **Waluta PLN/USD/EUR/GBP/RON** — przy tworzeniu nowej B2BUnit generowane są CostCenter i Budget dla każdej z tych 5 walut automatycznie.
- **Statusy terminalne** — `OrderStatusUpdateEndpoint` blokuje zmianę statusu dla CANCELLED i INVOICED; inne endpointy tego nie sprawdzają.

