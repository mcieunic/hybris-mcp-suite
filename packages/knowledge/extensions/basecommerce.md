# basecommerce

## Cel
`basecommerce` to fundament SAP Commerce Cloud obsługujący podstawowe domeny e-commerce: zamówienia, koszyki, magazyn, dostawy, podatki zewnętrzne, wykrywanie fraudów oraz obsługę zwrotów. Rozszerzenie dostarcza modele danych (items.xml), serwisy i strategie używane przez wyższe warstwy (commerceservices, accelerator). Zawiera też store locator (PointOfService, Warehouse) i obsługę harmonogramowania zamówień.

## Charakter

| Typ | OOTB | Status |
|-----|------|--------|
| Core extension (brak storefrontu) | tak | aktywna, wymagana |
| Zależność: `apiregistryservices` | tak | — |
| Brak frontendu / CMS | tak | — |

## Dependencies

- `apiregistryservices`

## Kluczowe items (najważniejsze!)

| Item | Extends | Tabela DB | Kluczowe atrybuty |
|------|---------|-----------|-------------------|
| `Order` | (platform AbstractOrder) | — | versionID, originalVersion, fraudulent, potentiallyFraudulent, statusDisplay |
| `AbstractOrderEntry` | (platform) | — | chosenVendor, deliveryAddress, deliveryMode, namedDeliveryDate, quantityStatus |
| `Consignment` | GenericItem | Consignments | code, shippingAddress, deliveryMode, shippingDate, trackingID, carrier, status |
| `ConsignmentEntry` | GenericItem | ConsignmentEntries | quantity, shippedQuantity |
| `ReturnRequest` | GenericItem | ReturnRequest | code, RMA, currency, status, subtotal, totalTax, returnWarehouse, replacementOrder |
| `ReturnEntry` | GenericItem | ReturnEntry | orderEntry, expectedQuantity, receivedQuantity, status, action, reason, tax |
| `RefundEntry` | ReturnEntry | — | reason (RefundReason), amount, currency, refundedDate |
| `ReplacementEntry` | ReturnEntry | — | reason (ReplacementReason) |
| `ReturnOrder` | Order | — | fulfilmentStatus, notes |
| `StockLevel` | GenericItem | StockLevels | product, available, reserved, overSelling, preOrder, inStockStatus, releaseDate, treatNegativeAsZero |
| `Warehouse` | GenericItem | Warehouses | code, name, default |
| `PointOfService` | GenericItem | PointOfService | name, address, latitude, longitude, openingSchedule, type, storeImage |
| `BaseStore` | GenericItem | BaseStore | uid, name, storelocatorDistanceUnit |
| `BaseSite` | GenericItem | CMSSite | uid, name |
| `Address` | (platform) | — | line1, line2 |
| `OrderCancelConfig` | GenericItem | OrderCancelConfigs | orderCancelAllowed, partialCancelAllowed, cancelAfterWarehouseAllowed, queuedOrderWaitingTime |
| `OrderModificationRecord` | GenericItem | OrderModifiRecords | inProgress, identifier |
| `OrderModificationRecordEntry` | GenericItem | OrderModifiRecEntrs | code, timestamp, status, principal, notes |
| `OrderHistoryEntry` | GenericItem | OrderHistoryEntries | timestamp, employee, description, previousOrderVersion |
| `FraudReport` | GenericItem | FraudReports | code, provider, timestamp, status, explanation |
| `ProductTaxCode` | GenericItem | ProductTaxCodes | productCode, taxArea, taxCode |
| `Campaign` | GenericItem | Campaign | code, name, startDate, endDate, enabled |
| `OpeningSchedule` | GenericItem | OpeningSchedules | code, name |
| `WeekdayOpeningDay` | OpeningDay | OpeningDays | dayOfWeek |
| `SpecialOpeningDay` | OpeningDay | OpeningDays | date, closed, name, message |
| `SAPGenericPaymentInfo` | PaymentInfo | — | sapCartId, sapPaymentMethod, sapPaymentMethodCode, sapCardType, sapCardNumber |
| `GenericVariantProduct` | VariantProduct | — | — |
| `VariantCategory` | Category | — | hasImage |
| `VariantValueCategory` | Category | — | sequence |
| `StockLevelHistoryEntry` | GenericItem | StockLevelHistoryEntry | updateDate, actual, reserved, updateType |
| `DeeplinkUrl` | GenericItem | DeeplinkUrls | code, name, baseUrl |
| `ProductOrderLimit` | GenericItem | ProductOrderLimits | code, intervalResolution, intervalValue, maxNumberPerOrder |

## Services / Facades / Strategies

| Komponent | Bean ID | Klasa implementacji | Rola |
|-----------|---------|---------------------|------|
| BaseSiteService | `defaultBaseSiteService` | `DefaultBaseSiteService` | Zarządzanie BaseSite w sesji |
| BaseStoreService | `defaultBaseStoreService` | `DefaultBaseStoreService` | Pobieranie/zarządzanie BaseStore |
| StockService | `defaultStockService` | `DefaultStockService` | Odczyt i modyfikacja poziomu stocku |
| ReturnService | `defaultReturnService` | `DefaultReturnService` | Tworzenie ReturnRequest, ReturnEntry |
| RefundService | `defaultRefundService` | `DefaultRefundService` | Obsługa RefundEntry |
| OrderCancelService | `defaultOrderCancelService` | `DefaultOrderCancelService` | Anulowanie zamówień |
| OrderHistoryService | `defaultOrderHistoryService` | `DefaultOrderHistoryService` | Historia wersji zamówień |
| OrderSplittingService | `defaultOrderSplittingService` | `DefaultOrderSplittingService` | Podział zamówień na consignments |
| ConsignmentService | `defaultConsignmentService` | `DefaultConsignmentService` | Zarządzanie Consignment |
| WarehouseService | `defaultWarehouseService` | `DefaultWarehouseService` | Zarządzanie magazynami |
| PointOfServiceService | `defaultPointOfServiceService` | `DefaultPointOfServiceService` | Obsługa POS/sklepów stacjonarnych |
| FraudService | `defaultFraudService` | `DefaultFraudService` | Wykrywanie fraudów przez symptomy |
| ProductTaxCodeService | `productTaxCodeService` | `DefaultProductTaxCodeService` | Kody podatków zewnętrznych |
| CampaignService | `defaultCampaignService` | `DefaultCampaignService` | Kampanie marketingowe |
| OrderFulfillmentProcessService | `defaultOrderFulfillmentProcessService` | `DefaultOrderFulfillmentProcessService` | Start procesu fulfillmentu |
| OrderCancelRecordsHandler | `defaultOrderCancelRecordsHandler` | `DefaultOrderCancelRecordsHandler` | Zapis rekordów anulowania |
| RMAGenerator | `defaultRMAGenerator` | `DefaultRMAGenerator` | Generowanie numerów RMA |
| ApplyExternalTaxesStrategy | `defaultApplyExternalTaxesStrategy` | `DefaultApplyExternalTaxesStrategy` | Hook dla podatków zewnętrznych |
| ProductAvailabilityStrategy | `defaultProductAvailabilityStrategy` | `DefaultProductAvailabilityStrategy` | Obliczanie dostępności produktu |
| BaseStoreSelectorStrategy | `defaultBaseStoreSelectorStrategy` | `DefaultBaseStoreSelectorStrategy` | Wybór BaseStore dla sesji |

## Spring beany (selektywnie)

| Bean ID | Klasa | Opis |
|---------|-------|------|
| `splitByAvailableCount` | `SplitByAvailableCount` | Strategia podziału zamówień wg dostępności |
| `splitByDeliveryMode` | `SplitByDeliveryMode` | Podział wg trybu dostawy |
| `splitByWarehouse` | `SplitByWarehouse` | Podział wg magazynu |
| `splitByNamedDeliveryDate` | `SplitByNamedDeliveryDate` | Podział wg daty dostawy |
| `enterCancellingStrategy` | `EnterCancellingStrategy` | Zmiana statusu zamówienia na CANCELLING |
| `setCancellledStrategy` | `SetCancellledStrategy` | Finalne ustawienie statusu CANCELLED |
| `orderStateDenialStrategy` | `OrderStateDenialStrategy` | Blokowanie anulowania wg stanu |
| `sentToWarehouseDenialStrategy` | `SentToWarehouseDenialStrategy` | Blokada po wysłaniu do magazynu |
| `shippingDenialStrategy` | `ShippingDenialStrategy` | Blokada po wysyłce |
| `blackListSymptom` | `BlackListSymptom` | Symptom fraudu: czarna lista |
| `whiteListSymptom` | `WhiteListSymptom` | Symptom fraudu: biała lista |
| `firstTimeOrderSymptom` | `FirstTimeOrderSymptom` | Symptom: pierwsze zamówienie klienta |
| `differentAddressesSymptom` | `DifferentAddressesSymptom` | Symptom: rozbieżność adresów |
| `geocodeAddressesJob` | `GeocodingJob` | CronJob geokodowania adresów POS |
| `cartToOrderJob` | `CartToOrderJob` | CronJob konwersji koszyka do zamówienia |
| `defaultXssEncodeService` | `DefaultXssEncodeService` | Sanityzacja XSS |

## Wzorce

- **Stock level management**: `StockLevel` jest powiązany z `Warehouse` i `Product`. Dostępność oblicza `DefaultProductAvailabilityStrategy` na podstawie `available - reserved + overSelling`. Historia zmian zapisywana w `StockLevelHistoryEntry` (ograniczona przez `maxStockLevelHistoryCount`).

- **Return request flow**: Tworzenie `ReturnRequest` → generowanie RMA (`DefaultRMAGenerator`) → `ReturnEntry` (RefundEntry lub ReplacementEntry) → `ReturnProcess` (BusinessProcess) → `OrderReturnRecord` z wpisami `OrderReturnRecordEntry`. Obsługa przez `DefaultReturnService` i `DefaultRefundService`.

- **Order cancel denial chain**: Serwis `DefaultOrderCancelService` przechodzi przez łańcuch `denial strategies` (orderStateDenialStrategy, sentToWarehouseDenialStrategy, shippingDenialStrategy, partialCancelRulesViolationStrategy, singleCancelRequestDenialStrategy). Jeśli żadna nie blokuje — wykonuje `ImmediateCancelRequestExecutor` lub `WarehouseProcessingCancelRequestExecutor`.

## Pułapki / gotchas

- `Order` i `AbstractOrderEntry` są definiowane jako `autocreate="false" generate="false"` — rozszerzenie tylko dodaje atrybuty do typów platformowych, nie tworzy nowych tabel.
- `SAPGenericPaymentInfo` jest oznaczony jako `generate="false"`, co oznacza brak generowania jaloklasy — używany wyłącznie przez SAP payment integrations.
- `StockLevel.treatNegativeAsZero` — jeśli false, ujemny stan stocku jest brany pod uwagę (overselling). Błędy logiczne często wynikają z niezrozumienia tego flaga.
- `OrderCancelConfig` to singleton (jedna instancja globalna) — zmiana `queuedOrderWaitingTime` wpływa na wszystkie zamówienia.
- `OrderSplittingService` korzysta z listy strategii (`splitByWarehouse`, `splitByDeliveryMode` itp.) — kolejność strategii na liście determinuje wynik podziału.
- `BaseSite` i `BaseStore` są zdefiniowane w `basecommerce`, ale ich powiązania (np. `stores` na `BaseSite`) są definiowane w wyższych rozszerzeniach (commerceservices).
- Geokodowanie POS przez `GeocodingJob` wymaga konfiguracji klucza Google Maps API (`storelocator.geocoding.apiKey`); domyślnie używany jest `CommerceMockGeoWebServiceWrapper` (mock).
- `ProductOrderLimit` nie jest automatycznie egzekwowany — wymaga własnej logiki walidacji w serwisach wyższych warstw.

