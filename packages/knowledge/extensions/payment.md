# payment

## Cel
Rozszerzenie `payment` dostarcza abstrakcję integracji z dostawcami płatności (PSP). Definiuje command-based model operacji płatniczych: AUTHORIZATION, CAPTURE, PARTIAL_CAPTURE, REFUND_FOLLOW_ON, REFUND_STANDALONE, CANCEL, VOID oraz zarządzanie subskrypcjami kart. Własna logika biznesowa PSP (np. Adyen, Stripe) jest enkapsulowana w implementacjach command interfejsów, bez konieczności modyfikacji core serwisów.

## Charakter

| Cecha | Wartość |
|-------|---------|
| Typ | Service-layer extension (brak UI) |
| Wzorzec | Command pattern — każda operacja PSP to oddzielny command interface |
| Zależność od | `basecommerce` |
| Dostarcza | `paymentService`, `cardPaymentService`, `transactionInfoService`, interceptory, strategię klonowania zamówień |
| Testowalność | Gotowa implementacja Mock (Mockup provider) w `payment-spring-test.xml` |

## Dependencies

- `basecommerce` (jedyna zadeklarowana zależność w `extensioninfo.xml`)
- platformowe: `servicelayer`, `core` (przez `basecommerce`)

## Kluczowe items

| Item / Enum | Tabela DB | Kluczowe atrybuty |
|-------------|-----------|-------------------|
| `PaymentTransaction` | `PaymentTransactions` (typecode 2100) | `code`, `requestId`, `requestToken`, `paymentProvider`, `plannedAmount`, `currency`, `info` (→PaymentInfo), `versionID`; relacja N:1 do `AbstractOrder` |
| `PaymentTransactionEntry` | `PaymntTrnsctEntries` (typecode 2101) | `type` (PaymentTransactionType), `amount`, `currency`, `time`, `transactionStatus`, `transactionStatusDetails`, `requestToken`, `requestId`, `subscriptionID`, `code`, `versionID` |
| `PaymentInfo` (extend) | — | `billingAddress` (Address, partof) |
| `CreditCardPaymentInfo` (extend) | — | `subscriptionId` — referencja do danych karty w zewnętrznym PSP |
| `PaymentTransactionType` (enum) | — | `AUTHORIZATION`, `CAPTURE`, `PARTIAL_CAPTURE`, `REFUND_FOLLOW_ON`, `REFUND_STANDALONE`, `CANCEL`, `CREATE_SUBSCRIPTION`, `UPDATE_SUBSCRIPTION`, `GET_SUBSCRIPTION_DATA`, `DELETE_SUBSCRIPTION` |
| `TransactionStatus` (enum, DTO) | — | `ACCEPTED`, `ERROR`, `REJECTED`, `REVIEW` |

## Services / Facades / Strategies

| Klasa / Interface | Alias / Bean | Opis |
|-------------------|-------------|------|
| `DefaultPaymentServiceImpl` | `paymentService` | Główny serwis; deleguje do `cardPaymentService`; tworzy `PaymentTransaction` i `PaymentTransactionEntry` |
| `DefaultCardPaymentServiceImpl` | `cardPaymentService` | Pobiera właściwy `CommandFactory` z rejestru i wykonuje command |
| `DefaultTransactionInfoService` | `transactionInfoService` | Sprawdza czy authorization jest ACCEPTED/ważna |
| `DefaultMerchantTransactionCodeGenerator` | `transactionCodeGenerator` | Generuje unikalne kody transakcji na bazie kodu zamówienia |
| `DefaultCreditCardPaymentInfoStrategy` | `paymentInfoCreator` | Tworzy `CreditCardPaymentInfo` i przypisuje do `PaymentTransaction` |
| `AuthorizationCommand` | interface | Realizacja: AUTH u PSP |
| `CaptureCommand` | interface | Realizacja: CAPTURE (settlement) |
| `PartialCaptureCommand` | interface | Realizacja: częściowy CAPTURE |
| `FollowOnRefundCommand` | interface | Realizacja: refund powiązany z transakcją |
| `StandaloneRefundCommand` | interface | Realizacja: refund bez oryginalnej transakcji |
| `VoidCommand` | interface | Realizacja: anulowanie autoryzacji |
| `EnrollmentCheckCommand` | interface | Realizacja: sprawdzenie 3D Secure enrollment |
| `CreateSubscriptionCommand` | interface | Realizacja: zapis karty w PSP (tokenizacja) |
| `CommandFactoryRegistryMockImpl` | `mockupCommandFactoryRegistry` | Mock registry — reference impl na potrzeby testów |
| `DefaultCommandFactoryRegistryImpl` | `commandFactoryRegistry` | Produkcyjny rejestr factory'ów — każdy PSP rejestruje swój `CommandFactory` |

## Spring beany (selektywnie)

| Bean id / alias | Klasa | Uwagi |
|-----------------|-------|-------|
| `paymentService` | `DefaultPaymentServiceImpl` | Alias dla `defaultPaymentService` |
| `cardPaymentService` | `DefaultCardPaymentServiceImpl` | — |
| `transactionCodeGenerator` | `DefaultMerchantTransactionCodeGenerator` | Alias dla `defaultTransactionCodeGenerator` |
| `transactionInfoService` | `DefaultTransactionInfoService` | Alias dla `defaultTransactionInfoService` |
| `commandFactoryRegistry` | `DefaultCommandFactoryRegistryImpl` | Rejestr CommandFactory'ów PSP |
| `paymentInfoCreator` | `DefaultCreditCardPaymentInfoStrategy` | Tworzy PaymentInfo podczas płatności kartą |
| `defaultCodeGenerator` | `PersistentKeyGenerator` | Generator kodów transakcji (konfigurowalny przez properties) |
| `PreparePaymentTransactionInterceptor` | `PreparePaymentTransactionInterceptor` | Prepare-interceptor dla `PaymentTransaction` (autogeneracja code) |
| `PreparePaymentTransactionEntryInterceptor` | `PreparePaymentTransactionEntryInterceptor` | Prepare-interceptor dla `PaymentTransactionEntry` |
| `paymentOrderPartOfMembersCloningStrategy` | `PaymentOrderPartOfMembersCloningStrategy` | Strategia klonowania PaymentInfo przy kopiowaniu zamówienia |
| `mockupCommandFactory` (test) | `DefaultCommandFactoryImpl` | Mock factory z provider="Mockup"; wszystkie commands to Mock impls |
| `mockupCommandFactoryRegistry` (test) | `CommandFactoryRegistryMockImpl` | Mock registry używany w testach integracyjnych |

## Pattern: command-based PSP integration

- Każda integracja PSP (np. Adyen, Stripe) implementuje wybrane command interfejsy z pakietu `de.hybris.platform.payment.commands`
- Implementacje są rejestrowane w `CommandFactory` (mapa: `Class<Command> -> implementacja`)
- `CommandFactory` jest rejestrowany w `DefaultCommandFactoryRegistryImpl` z unikalną nazwą providera (`paymentProvider`)
- `cardPaymentService` pobiera factory dla aktualnego providera i wykonuje odpowiedni command
- Implementacja mock (`Mockup` provider) w `payment-spring-test.xml` stanowi reference implementation i jest używana w testach:
  - `AuthorizationMockCommand` — ACCEPTED jeśli karta nie wygasła i kwota <= 5000; REVIEW jeśli > 5000; REJECTED dla wygasłych kart
  - Analogiczne mock klasy dla każdego command interface

## Pułapki / gotchas

- `transactionStatus` w `PaymentTransactionEntry` to `java.lang.String`, nie enum — wartości z `TransactionStatus` DTO enum muszą być konwertowane ręcznie (`.name()`)
- `TransactionStatus` i `TransactionStatusDetails` to DTO enums (z `payment-beans.xml`), nie Hybris enumtypes — nie są w bazie danych
- Unikalny index na `PaymentTransactionEntry`: `(code, paymentTransaction, type, versionID)` — próba ponownego zapisu tej samej operacji bez zmiany `versionID` rzuci wyjątek
- `CommandFactoryRegistry` jest globalny — rejestracja dwóch factory'ów z tym samym `paymentProvider` nadpisze poprzedni bez ostrzeżenia
- Mock (`payment-spring-test.xml`) nie jest ładowany w produkcji — trzeba ręcznie zaimportować lub zdefiniować własny factory; brak factory dla danego providera skutkuje `NoSuchElementException` w runtime
- Klonowanie zamówień: `paymentOrderPartOfMembersCloningStrategy` nadpisuje domyślną strategię przez alias `orderPartOfMembersCloningStrategy` — przy customizacji strategii klonowania trzeba uwzględnić tę zależność
- `versionID` ma `write=false, initial=true` — ustawiane raz przy tworzeniu, nie można modyfikować; wykorzystywane w unikalnym indeksie do obsługi wersji transakcji

