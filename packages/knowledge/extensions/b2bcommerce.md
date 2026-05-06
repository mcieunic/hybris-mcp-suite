# b2bcommerce

## Cel

Rozszerzenie `b2bcommerce` dostarcza rdzeń modelu domenowego dla handlu B2B w SAP Commerce Cloud. Definiuje hierarchię jednostek organizacyjnych (`B2BUnit`), klientów biznesowych (`B2BCustomer`), centra kosztów (`B2BCostCenter` — w `commerceservices`), budżety (`B2BBudget`), limity kredytowe (`B2BCreditLimit`) oraz grupy uprawnień. Stanowi bazę dla procesu zatwierdzania zamówień realizowanego przez `b2bapprovalprocess`.

## Charakter

| Właściwość | Wartość |
|---|---|
| Typ | Service-layer extension (model + serwisy + DAO) |
| Pakiet bazowy | `de.hybris.platform.b2b` |
| Zależności | `commerceservices` |
| Brak UI | tak — brak CMS, brak storefront tagów |
| Essential data | usergroups impex, jobs impex |

## Dependencies

- `commerceservices` (jedyna bezpośrednia zależność wg `extensioninfo.xml`)
- Pośrednio zależy od `platform` (dziedziczone automatycznie)

## Kluczowe items (kluczowe!)

| Item | Tabela DB | Kluczowe atrybuty |
|---|---|---|
| `B2BUnit` | (dziedziczy po `OrgUnit`) | `reportingOrganization`, `isRoot` (dynamic), `b2bExcludedPaymentTypes`, `approvalProcessCode` (z b2bapprovalprocess) |
| `B2BCustomer` | (dziedziczy po `Customer`) | `defaultB2BUnit`, `active`, `email` |
| `B2BUserGroup` | (dziedziczy po `UserGroup`) | — (marker type bez własnych atrybutów) |
| `B2BBudget` | `b2bbudgets` | `code`, `name` (lok.), `budget`, `currency`, `dateRange`, `active` |
| `B2BCostCenter` | `commerceservices` | zdefiniowany w `commerceservices`, relacja wiele-do-wielu z `B2BBudget` |
| `B2BPermission` | `b2bpermissions` (b2bapprovalprocess) | `code`, `active`, `message` |
| `B2BPermissionResult` | `b2bpermissionresults` (b2bapprovalprocess) | `permission`, `permissionTypeCode`, `status`, `approver`, `note` |
| `B2BApprovalProcess` | (b2bapprovalprocess) | BusinessProcess dla zatwierdzania zamówień |
| `B2BBookingLineEntry` | `b2bbookinglineentry` | `costCenter`, `amount`, `currency`, `bookingStatus`, `orderEntry` |
| `B2BMerchantCheck` | `b2bmerchantcheck` | `code`, `active` — baza dla `B2BCreditLimit` |
| `B2BCreditLimit` | `b2bcreditlimit` | `amount`, `currency`, `dateRange`, `alertThreshold`, `alertRateType` |
| `B2BComment` | `b2bcomment` | `comment`, `owner`, `modifiedDate` — komentarze do zamówień |
| `B2BRegistration` | `b2bregistration` | pełne dane firmy + kontaktu przy rejestracji B2B |
| `B2BReportingSet` | `b2breportingset` | grupowanie raportowe jednostek |
| `B2BQuoteLimit` | `b2bquotelimit` | `amount`, `currency` — limit kwotowania per unit |

Typy uprawnień (enum `B2BPermissionTypeEnum`): `B2BOrderThresholdPermission`, `B2BOrderThresholdTimespanPermission`, `B2BBudgetExceededPermission`.

Grupy systemowe (essential data): `b2bgroup`, `b2badmingroup`, `b2bcustomergroup`, `b2bmanagergroup`, `b2bapprovergroup`, `salesrepgroup`, `unitorderviewergroup`.

## Services / Facades / Strategies

| Klasa / interfejs | Typ | Opis |
|---|---|---|
| `B2BUnitService` / `DefaultB2BUnitService` | Service | Zarządzanie hierarchią jednostek, wyszukiwanie root unit, członkowie |
| `B2BCustomerService` / `DefaultB2BCustomerService` | Service | Operacje na B2BCustomer, zmiana unit, zarządzanie grupami |
| `B2BCostCenterService` / `DefaultB2BCostCenterService` | Service | CRUD centrów kosztów, powiązanie z budżetami |
| `B2BBudgetService` / `DefaultB2BBudgetService` | Service | Obsługa budżetów, walidacja dat i kwot |
| `B2BOrderService` | Service | Rozszerzenie orderu o atrybuty B2B (unit, koszt) |
| `B2BUnitOrderService` / `DefaultB2BUnitOrderService` | Service | Pobieranie zamówień na poziomie jednostki (unit order view) |
| `B2BCartService` / `DefaultB2BCartService` | Service | Rozszerzenie koszyka B2B (extends `defaultCartService`) |
| `B2BItemService` | Service | Generyczne wyszukiwanie itemów B2B przez FlexibleSearch |
| `B2BCurrencyConversionService` | Service | Przeliczenia walutowe dla budżetów/limitów |
| `B2BCommentService` | Service | Zarządzanie komentarzami do zamówień |
| `B2BReportingService` | Service | Raportowanie — B2BReportingSet, BookingLineEntry |
| `B2BQuoteService` | Service | Obsługa kwotowania B2B |
| `B2BCommerceUnitService` | Service | Company management: tworzenie/edycja B2BUnit (API wyższy poziom) |
| `B2BCommerceUserService` | Service | Company management: zarządzanie użytkownikami B2B |
| `B2BCommerceCostCenterService` | Service | Company management: paged CRUD cost center |
| `B2BCommerceB2BUserGroupService` | Service | Company management: zarządzanie B2BUserGroup |
| `B2BGroupCycleValidator` | Validator | Wykrywa cykliczne zależności w hierarchii grup |
| `B2BUserGroupsLookUpStrategy` / `DefaultB2BUserGroupsLookUpStrategy` | Strategy | Wyznaczanie grupy B2B dla sesji użytkownika |
| `B2BCustomerListSearchStrategy` | Strategy | Implementacja `customerListSearchStrategy` dla B2B |
| `DefaultB2BQuoteEvaluationStrategy` | Strategy | Ocena czy kwotowanie jest wymagane |
| `B2BUnitDao` / `DefaultB2BUnitDao` | DAO | FlexibleSearch po B2BUnit |
| `PagedB2BCustomerDao` / `DefaultPagedB2BCustomerDao` | DAO | Stronicowane wyniki klientów B2B |
| `B2BCostCenterDao` | DAO | Wyszukiwanie cost center per unit |
| `B2BBudgetDao` / `DefaultPagedB2BBudgetDao` | DAO | Budżety z paginacją |
| `B2BOrderDao` | DAO | Zamówienia B2B wg jednostki/użytkownika |
| `B2BRegistrationDao` | DAO | Wyszukiwanie wniosków rejestracyjnych |

## Spring beany (selektywnie)

| Bean id | Klasa | Uwaga |
|---|---|---|
| `defaultB2BUnitService` | `DefaultB2BUnitService` | centralny serwis hierarchii |
| `defaultB2BCustomerService` | `DefaultB2BCustomerService` | — |
| `defaultB2BCostCenterService` | `DefaultB2BCostCenterService` | — |
| `defaultB2BBudgetService` (brak id — alias klasy) | `DefaultB2BBudgetService` | brak jawnego id w spring.xml |
| `defaultB2BCartService` | `DefaultB2BCartService` | parent: `defaultCartService` |
| `defaultB2BCartFactory` | `DefaultB2BCartFactory` | fabryka koszyka B2B |
| `defaultB2BCurrencyConversionService` | `DefaultB2BCurrencyConversionService` | parent: `abstractBusinessService` |
| `DefaultB2BUnitOrderService` | `DefaultB2BUnitOrderService` | bean id == nazwa klasy |
| `b2bCustomerListSearchStrategy` | `B2BCustomerListSearchStrategy` | dodaje się do mapy `customerListSearchStrategyMap` |
| `afterSessionCreationListener` | `AfterSessionCreationListener` | ustawia B2BUnit w sesji po logowaniu |
| `afterSessionUserChangeListener` | `AfterSessionUserChangeListener` | aktualizacja kontekstu B2B przy zmianie użytkownika |
| `customerDefaultGroupInterceptor` | `B2BCustomerInitDefaultsInterceptor` | PrepareInterceptor — ustawia domyślną grupę B2B |
| `B2BBudgetModelValidateInterceptor` | `B2BBudgetModelValidateInterceptor` | walidacja budżetu (daty, kwoty) |
| `B2BCostCenterModelValidateInterceptor` | `B2BCostCenterModelValidateInterceptor` | walidacja cost center |
| `B2BUnitPaymentTypesValidateInterceptor` | `B2BUnitPaymentTypesValidateInterceptor` | weryfikacja dozwolonych typów płatności |
| `b2bUnitAfterInitializationEndEventListener` | `OrgUnitAfterInitializationEndEventListener` | regeneruje ścieżki OrgUnit po init |
| `generateB2BUnitPathsJob` | `GenerateOrgUnitPathsJob` | CronJob regenerujący hierarchię ścieżek |
| `defaultB2BUnitIsRootDynamicAttributeHandler` | `DefaultB2BUnitIsRootDynamicAttributeHandler` | dynamiczny atrybut `isRoot` |
| `defaultB2BRegistrationDao` | `DefaultB2BRegistrationDao` | — |
| `defaultPrincipalGroupMembersDao` | `DefaultPrincipalGroupMembersDao` | — |

## Procesy approval

Właściwy proces approval jest w rozszerzeniu `b2bapprovalprocess`, ale `b2bcommerce` dostarcza fundament:

- **B2BApprovalProcess flow** — BusinessProcess (zdefiniowany w `b2bapprovalprocess`); startuje gdy zamówienie wymaga akceptacji; przechodzi przez WorkflowAction zatwierdzane przez approverów z grupy `b2bapprovergroup`.
- **Ocena czy order wymaga approval** — strategia `OrderRequiresApprovalStrategy` (w `b2bapprovalprocess`) iteruje przez łańcuch `PermissionEvaluateStrategy`; każdy ewaluator sprawdza inny warunek.
- **Permission evaluators** (w `b2bapprovalprocess`):
  - `B2BBudgetExceededPermission` — sprawdza czy suma zamówień w danym przedziale czasowym przekracza przydzielony budżet B2BUnit.
  - `B2BOrderThresholdPermission` — sprawdza czy wartość pojedynczego zamówienia przekracza próg kwotowy (`threshold` + `currency`) przypisany do B2BCustomer lub B2BUnit.
  - `B2BOrderThresholdTimespanPermission` — jw. ale ze skumulowaną sumą w przedziale czasu (`range`).
- **B2BPermissionResult** — wynik ewaluacji permisji: `status` (OPEN/CLOSED/PENDING_APPROVAL), `approver`, `note`; wiele wyników na jeden order.
- **Escalacja** — `EscalationTask` (b2bapprovalprocess) wywoływany gdy approver nie odpowie w terminie.

## Pułapki / gotchas

- `B2BCostCenter` jest zdefiniowany w `commerceservices`, **nie** w `b2bcommerce` — błąd podczas szukania w złym miejscu.
- `B2BPermission` i `B2BApprovalProcess` żyją w `b2bapprovalprocess` — `b2bcommerce` to tylko model bazowy bez procesu approval.
- `isRoot` w `B2BUnit` to atrybut **dynamiczny** (handler `defaultB2BUnitIsRootDynamicAttributeHandler`) — nie ma kolumny w DB, nie da się filtrować przez FlexibleSearch bezpośrednio.
- Hierarchia B2BUnit jest drzewem przez `OrgUnit.members` (PrincipalGroup) — cykliczne zależności są wykrywane przez `B2BGroupCycleValidator`, ale tylko przy zapisie, nie przy imporcie impex.
- `B2BCustomer.defaultB2BUnit` musi być ustawiony — bez niego sesja B2B nie ma kontekstu unit i serwisy rzucają wyjątki.
- Grupy systemowe (`b2badmingroup`, `b2bmanagergroup` itp.) są tworzone przez `essentialdata_1_usergroups.impex` — muszą istnieć przed załadowaniem danych B2B.
- `afterSessionCreationListener` ustawia B2BUnit w sesji — customizacja sesji B2B powinna rozszerzać ten listener, nie go zastępować.
- `generateB2BUnitPathsJob` musi być uruchomiony po masowym imporcie jednostek, by ścieżki OrgUnit były aktualne.
- `B2BRegistration` nie tworzy automatycznie B2BCustomer — wymaga osobnego procesu (B2BRegistrationApprovedProcess), który wystawia token resetowania hasła.

