# sniezkaassistedservicefacades

## Cel

Customizacja modułu Assisted Service Mode (ASM) — rozszerza standardowe facade/service SAP Commerce o logikę specyficzną dla Śnieżka: obsługę agentów B2B i B2C, logowanie SSO/SAML, restrykcje CMS oparte na grupie agenta ASM oraz filtrowanie nieaktywnych klientów B2B.

## Charakter

Rozszerzenie warstwy fasad i serwisów (bez własnego modelu danych). Nadpisuje standardowe beany `assistedServiceFacade` i `assistedServiceService`. Zawiera aspekt AOP do SSO oraz implementację CMS restriction evaluatora.

## Dependencies

- `assistedservicefacades` (SAP standard)
- `sniezkacore`

## Kluczowe items

Brak — rozszerzenie nie definiuje własnych typów w `items.xml`.

## Beans (DTO)

Brak — `sniezkaassistedservicefacades-beans.xml` jest pusty (tylko przykładowy template).

## Services / Facades / Strategies

| Klasa | Dziedziczy po | Rola |
|---|---|---|
| `CustomDefaultAssistedServiceFacade` | `DefaultAssistedServiceFacade` | Override `emulateAfterLogin`, `emulateCustomer`, `loginAssistedServiceAgent`; weryfikacja dostępu przez `asm.without.restriction.login.disabled`; przeładowanie cache B2B po emulacji; filtrowanie nieaktywnych B2BCustomer |
| `CustomDefaultAssistedServiceService` | `DefaultAssistedServiceService` | Override `getCustomers` i `getCustomer`; dispatching do `ASMQueryBuilder` na podstawie kanału bazy (B2B/B2C); wyszukiwanie po c4cId |
| `DefaultASMPermissionResolver` | impl `ASMPermissionResolver` | Sprawdza czy agent ASM należy do grupy `asmadmin`; jeśli sesja nie jest ASM — zwraca `true` |
| `DefaultASMParamsAccessor` | impl `ASMParamsAccessor` | Przechowuje/odczytuje UID organizacji (`ID`) z sesji Hybris |
| `B2BASMQueryBuilder` | impl `ASMQueryBuilder` | FlexibleSearch dla B2BCustomer z joiniem na B2BUnit; obsługuje filtr po orgUid i c4cId |
| `B2CASMQueryBuilder` | impl `ASMQueryBuilder` | FlexibleSearch dla standardowego Customer (B2C) |
| `ASMAdminRestrictionEvaluator` | `CMSRestrictionEvaluator<ASMAdminRestrictionModel>` | Evaluator restrykcji CMS typu `ASMAdminRestriction`; deleguje do `ASMPermissionResolver` |
| `SSOUserLoginAspect` | Aspekt AOP (`@Aspect`) | Around `DefaultSSOService.getOrCreateSSOUser` — zachowuje przynależność do grupy `asmadmin` po logowaniu SAML/SSO |

## Spring beany (selektywnie)

| Bean id | Alias | Uwagi |
|---|---|---|
| `customDefaultAssistedServiceFacade` | `assistedServiceFacade` | parent: `defaultAssistedServiceFacade` |
| `customDefaultAssistedServiceService` | `assistedServiceService` | parent: `defaultAssistedServiceService` |
| `defaultASMPermissionResolver` | `aSMPermissionResolver` | |
| `defaultASMParamsAccessor` | `asmParamsAccessor` | |
| `aSMAdminRestrictionEvaluator` | — | mapowany przez `aSMAdminRestrictionEvaluatorMapping` na typeCode `ASMAdminRestriction` |
| `sSOUserLoginAspect` | — | aktywowany przez `<aop:aspectj-autoproxy/>` |
| `queryBuilderMap` | — | mapa `B2B → b2bASMQueryBuilder`, `B2C → b2cASMQueryBuilder` |

Właściwość konfiguracyjna: `asm.admin.group=asmadmin` (z `project.properties`).

## Pułapki / gotchas

- **`asm.without.restriction.login.disabled=true`** blokuje logowanie agentom bez orgUid w sesji, chyba że należą do grupy `asmadmin` — łatwo przypadkowo odciąć agentów podczas testów.
- **`SSOUserLoginAspect`** działa tylko jeśli `samlsinglesignon` jest na ścieżce; po SSO re-logowaniu grupy użytkownika są odtwarzane ręcznie — jeśli aspekt nie zadziała (np. brak rozszerzenia SSO), agent traci grupę `asmadmin`.
- **Dispatch po kanale** (`baseSiteService.getCurrentBaseSite().getChannel()`) — dla nowego site'u trzeba upewnić się, że kanał jest ustawiony na `B2B` lub `B2C`; brak kanału lub inny kod spowoduje NPE przy wyszukiwaniu klientów w ASM.
- **`B2BASMQueryBuilder.getCustomerQuery`** sprawdza `c4cId` przez DAO — jeśli `c4cId` jest pusty/null, query buduje się inaczej; błędna kolejność warunków może zwrócić wielu klientów dla jednego `customerId`.
- **Nieaktywni B2BCustomer** są cicho pomijani w emulacji (bez komunikatu dla agenta) — może być mylące w przypadku błędów konfiguracji konta.

