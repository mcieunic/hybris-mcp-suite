# sniezkasaporderexchangeb2b

## Cel

Customizacja standardowego modułu SAP `saporderexchangeb2b` odpowiedzialna za wysyłanie zamówień (B2B, B2C, Allegro) oraz danych klientów do SAP S/4 przez Data Hub (kolejka asynchroniczna CSV/IDoc).

## Charakter

Rozszerzenie czysto serwisowe – brak własnych item typów ani beanów DTO. Zawiera wyłącznie nadpisania contributorów i serwisów zdefiniowanych w platformie SAP.

## Dependencies

- `saporderexchangeb2b` – moduł SAP z sap-asynchronous-order-management
- `sniezkacore` – serwisy domeny Śnieżki (ExtendedB2BUnitService, CustomConfigurationService, OrderHelper, DeliveryPriorytetResolver)

## Kluczowe items

Brak własnych item typów (`items.xml` pusty). Rozszerzenie operuje na standardowych typach:

- `OrderModel` – główny obiekt wysyłany do SAP
- `B2BUnitModel` – jednostka B2B (soldTo, shipTo, billTo, ZR, WS, RG)
- `AddressModel` – adres dostawy/płatności/faktury
- `SAPPricingConditionModel` – warunki cenowe z SAP (tryb sync pricing)
- `SAPConfigurationModel` – konfiguracja SAP (salesOrg, division, distributionChannel, paymentModes)

Mapowania ról partnerskich:

| Rola SAP | Opis |
|----------|------|
| AG (SOLD_TO) | Jednostka kupująca / klient |
| WE (SHIP_TO) | Adres dostawy |
| RE (BILL_TO) | Adres faktury |
| ZR | Dystrybutor (relacja ZR) / wybrany dystrybutor Express |
| SP | Spedytor (forwardingAgent z deliveryMode) |
| WS | Jednostka B2B składająca zamówienie przez dystrybutora stockowego |
| RG | Jednostka technical partner |
| VE (PLACED_BY) | Sales rep (ASM) dla zamówień B2C |

Incoterms mapowanie wg trybu dostawy:

| Tryb dostawy | Incoterms |
|---|---|
| PERSONAL_PICK_UP | FCA, miasto: Zawada |
| PERSONAL_PICK_UP_B2C | FCA, miasto: z PoS |
| CIP_DELIVERY_MODES + CIP_B2B_UNITS | CIP |
| pozostałe | DAP |

Warunki cenowe:

- B2B (net): typ `ZCEN`
- B2C/Allegro (gross): typ `ZCEB`
- Dostawy kosztowe: osobna pozycja produktu z kodu `delivery.cost.product.code`
- Rabaty < 0.1 są pomijane (próg `DISCOUNT_MINIMUM_THRESHOLD`)

## Beans (DTO/JAXB)

Brak własnych beanów (`beans.xml` pusty – tylko przykłady zakomentowane).

## Services / Facades / Strategies

### Contributorzy (outbound CSV rows)

**`CustomDefaultB2BOrderContributor`** (`alias: sapOrderContributor`)
Nadpisuje `DefaultB2BOrderContributor`. Buduje wiersz nagłówka zamówienia z dodatkowymi polami: incoterms, komentarz, NIP (B2C/Allegro gdy inna niż główna), customerGroup (`PF` = paragon), salesOrg/division/distributionChannel (z B2BUnit lub SAPConfiguration), requiredRealizationDate (dla wybranych trybów DHL/Pocztex), pointId dla DHL Parcel i Poczty Polskiej, salesOff (warehouseId), languageIsoCode zawsze `pl`.

**`CustomDefaultB2BPartnerContributor`** (`alias: sapPartnerContributor`)
Nadpisuje `DefaultB2BPartnerContributor`. Obsługuje trzy ścieżki:
- `isB2BOrder` → `createB2BRows`: role AG/WE/RE + opcjonalne ZR/SP/WS/RG
- `isAllegroOrder` → `createAllegroRows`: WE/RE/AG z jednorazowym klientem Allegro + online payment / CoD partner
- else → `createB2CRows`: WE/RE/AG z jednorazowym klientem B2C + VE (ASM) + online payment / CoD partner

Obsługa jednorazowych klientów: gdy `customerId` = `ONE_TIME_CLIENT_*`, dołącza pełne dane adresowe inline (documentAddressId). Firma rozbijana na max 4×39 znaków (LAST_NAME, FIRST_NAME, MIDDLE_NAME, MIDDLE_NAME2).

Mapowanie metod płatności online:
- TPAY → `online.payment.partner.code.tpay`
- FAST_TRANSFER_ONLINE → `online.payment.partner.code.przelewy24`
- BLIK → `online.payment.partner.code.blik`
- CREDIT_CARD → `online.payment.partner.code.creditcard`

**`CustomDefaultOrderEntryContributor`** (`alias: sapOrderEntryContributor`)
Nadpisuje `DefaultOrderEntryContributor`. Buduje wiersze pozycji zamówienia. Dodatkowe kolumny: `deliveryPriorytet` (resolver), `itemCateg` (`ZTAS` dla zaprawy klejącej), `warehouseId`. Jeśli zamówienie ma koszt dostawy > 0, dodaje syntetyczną pozycję z kodem produktu `delivery.cost.product.code` (ilość 1, unit `PCE`). Dla zamówień z dzieckiem o `PriceType.DISTRIBUTOR` operuje na dziecku.

**`CustomDefaultSalesConditionsContributor`** (`alias: sapSalesConditionsContributor`)
Nadpisuje `DefaultSalesConditionsContributor`. Dwa tryby:
- **syncPricing aktywne**: wiersze z `SAPPricingConditionModel` (dane z SAP)
- **syncPricing nieaktywne**: wiersze z Hybris pricing (grossPrice, rabaty produktowe, rabaty zamówienia, koszt dostawy, koszt płatności)

Wysyła też `doNothing` promotion rules (wartość 0) żeby S/4 wiedziało o zastosowanej akcji. Do każdego rabatu dołącza `promCode` (`sapSalesAction` z reguły) i `CONDITION_CODE` (`sapConditionType`).

### Customer export

**`ExtendedCustomerExportService`** (`alias: customerExportService`)
Rozszerza `CustomerExportService`. Nadpisuje `prepareCustomerData` – gdy typ klienta to COMPANY, mapuje `mainAddress.company` na FIRSTNAME/LASTNAME (z cięciem do 40/80 znaków). Dodaje pole `nip` do danych adresowych. Zawsze ustawia `country=PL` gdy brak adresu.

**`ExtendedCustomerPublishAction`** (`alias: customerPublishAction`)
Rozszerza `CustomerPublishAction`. W `executeAction` wysyła `customer.mainAddress` do Data Hub (zamiast pustego adresu). Ustawia `sapConsumerID = customerID`, `sapIsReplicated = true`, zapisuje timestamp replikacji.

**`ExtendedCustomerRegistrationEventListener`**
Słucha `RegisterEvent`. Tworzy i startuje proces `customerRegistrationEmailProcess` (wysyłka e-maila powitalnego po rejestracji).

## Spring beany

| Bean id | Alias | Klasa |
|---------|-------|-------|
| `customDefaultB2BOrderContributor` | `sapOrderContributor` | `CustomDefaultB2BOrderContributor` |
| `customDefaultB2BPartnerContributor` | `sapPartnerContributor` | `CustomDefaultB2BPartnerContributor` |
| `customDefaultOrderEntryContributor` | `sapOrderEntryContributor` | `CustomDefaultOrderEntryContributor` |
| `customDefaultSalesConditionsContributor` | `sapSalesConditionsContributor` | `CustomDefaultSalesConditionsContributor` |
| `extendedCustomerExportService` | `customerExportService` | `ExtendedCustomerExportService` |
| `extendedCustomerPublishAction` | `customerPublishAction` | `ExtendedCustomerPublishAction` |
| `extendedCustomerRegistrationEventListener` | _(brak aliasu)_ | `ExtendedCustomerRegistrationEventListener` |

Wszystkie beany przez aliasy zastępują odpowiedniki platformy – brak równoległego działania.

## Flow wymiany

### Zamówienie → S/4

1. Klient składa zamówienie w storefront.
2. SAP order exchange (platforma) wykrywa złożone zamówienie i uruchamia `SendOrderToDataHubAction` z procesu fulfillmentu.
3. Każdy contributor (`sapOrderContributor`, `sapPartnerContributor`, `sapOrderEntryContributor`, `sapSalesConditionsContributor`) generuje wiersze CSV do kolejki Data Hub.
4. Data Hub konsoliduje CSV i wysyła IDoc `ORDERS05` do S/4.
5. S/4 potwierdza przyjęcie – zamówienie dostaje status SAP (np. `SENT_TO_ERP`).

### Rejestracja klienta → S/4

1. Klient rejestruje się → `RegisterEvent`.
2. `ExtendedCustomerRegistrationEventListener` uruchamia `customerRegistrationEmailProcess`.
3. Proces wykonuje `ExtendedCustomerPublishAction` → `ExtendedCustomerExportService.sendCustomerData` → wysyłka do Data Hub.
4. Data Hub replikuje klienta do S/4; po sukcesie `sapConsumerID` jest uzupełnione.

### Klucze generatora

- `keygen.order.code.start=2150000000`
- `keygen.customer.sap_customer_id.start=1910000000`

## Pułapki / gotchas

- **DEFAULT_ORDER_LANGUAGE zawsze `pl`** – nawet dla zamówień B2B i partnerów adresowych. Zmiana wymagałaby nadpisania stałej.
- **Próg rabatu 0.1** – rabaty poniżej 0.1 są cicho pomijane przy budowaniu wierszy warunków cenowych; debug-log zawiera ostrzeżenie.
- **Firma > 156 znaków** – tylko pierwsze 156 znaków (4×39) trafia do SAP; nadmiar jest ucięty bez informacji w logach.
- **Zamówienie z dzieckiem DISTRIBUTOR** – `CustomDefaultOrderEntryContributor` i `CustomDefaultSalesConditionsContributor` operują na dziecku, a `CustomDefaultB2BOrderContributor` i `CustomDefaultB2BPartnerContributor` na rodzicu. Niespójność może dawać inne kody zamówień w wierszach.
- **BillTo resolver** – `addressForPartnerRole` dla BILL_TO bierze pierwszy adres z pierwszej `billToUnit`; brak `billToUnit` lub pustej listy adresów skutkuje NPE.
- **`replicateregistereduser=true`** w `project.properties` – musi pozostać ustawione, inaczej klienci nie są replikowani do S/4 po rejestracji.
- **Testy resolverów** są w `testsrc` ale klasy resolverów (`DeliveryPriorytetResolver`, `DispatcherDeliveryPriorytetResolver`) nie są w tym rozszerzeniu – są w `sniezkacore`. Testy tu testują integrację z contributoram.
