# sniezkafulfilmentprocess

## Cel
Rozszerzenie odpowiedzialne za obsługę procesów biznesowych zamówień (BPM) w oparciu o silnik procesów SAP Commerce. Definiuje przepływy dla zamówień B2C i B2B, zarządzanie przesyłkami (consignment), obsługę zwrotów oraz proces zatwierdzania zamówień B2B. Zawiera action handlery, strategie podziału zamówień oraz adapterów integracji z magazynem.

## Charakter

| Cecha | Wartość |
|---|---|
| Typ | Rozszerzenie procesowe (BPM) |
| Pakiet bazowy | `pl.sniezka.fulfilmentprocess` |
| Zależności | `acceleratorservices`, `ticketsystem`, `sniezkacore` |
| Procesy XML | 4 (order-process, consignment-process, return-process, customB2bAccOrderApproval) |
| Action handlery | ~55 klas Java |

## Dependencies

- `acceleratorservices` — bazowy factory emailowy, kontekst Velocity
- `ticketsystem` — używany przez `CheckTransactionReviewStatusAction`
- `sniezkacore` — `CustomConfigurationService`, `ExtendedB2BUnitService`, `OrderApprovalB2BPermissionModel`, `CustomDefaultB2BPermissionService`

## Kluczowe items

| Item | Rozszerzenie | Opis |
|---|---|---|
| `ConsignmentProcess.done` | `sniezkafulfilmentprocess` | Flaga zakończenia podprocesu przesyłki |
| `ConsignmentProcess.waitingForConsignment` | `sniezkafulfilmentprocess` | Flaga oczekiwania na potwierdzenie z magazynu |
| `ConsignmentProcess.warehouseConsignmentState` | `sniezkafulfilmentprocess` | Stan procesu magazynowego (`WarehouseConsignmentState`) |

## Services / Facades / Strategies

| Klasa | Rola |
|---|---|
| `DefaultCheckOrderService` | Walidacja zamówienia przed procesem: obliczenia, wpisy, płatność, tryb dostawy |
| `OrderApprovalB2BPermissionEvaluationStrategy` | Strategia oceny uprawnień B2B; rozróżnia kontekst ORGANIZATION/DISTRIBUTOR/CHAIN |
| `SplitByAvailableCount` | Podział zamówienia wg dostępności stock |
| `SplitByDeliveryMode` | Podział wg trybu dostawy (pickup vs dostawa) |
| `SplitByEntryDeliveryAddress` | Podział wg adresu dostawy per wpis |
| `SplitByPoS` | Podział wg punktu sprzedaży (PoS) |
| `SplitByWarehouse` | Podział wg magazynu, z uwzględnieniem dostępności |
| `DefaultWarehouse2ProcessAdapter` | Mapuje `WarehouseConsignmentStatus` → `WarehouseConsignmentState`, triggeruje zdarzenia BPM |
| `MockProcess2WarehouseAdapter` | Mock adaptera magazynowego (używany na środowisku lokalnym) |

## Spring beany (selektywnie)

| Bean ID | Klasa | Uwagi |
|---|---|---|
| `checkOrderService` | `DefaultCheckOrderService` | alias: `defaultCheckOrderService` |
| `orderSplittingService` | `defaultOrderSplittingService` (parent) | alias na sniezka z 6 strategiami |
| `orderApprovalB2BPermissionEvaluationStrategy` | `OrderApprovalB2BPermissionEvaluationStrategy` | zależny od `extendedB2BUnitService`, `customConfigurationService` |
| `customFindApprovers` | `CustomFindApprovers` | parent: `findApprovers`; używa `CustomDefaultB2BPermissionService` |
| `customCheckWorkflowResults` | `CustomCheckWorkflowResults` | parent: `checkWorkflowResults`; sprawdza `OrderStatus.REJECTED` |
| `customStartWorkFlowForAdmin` | `CustomStartWorkFlowForAdmin` | uruchamia workflow dla admina gdy brak approverów |
| `changeOrderStatus` | `ChangeOrderStatusAction` | ustawia status zamówienia na `APPROVED` |
| `checkMissingPaymentAction` | `CheckMissingPaymentAction` | sprawdza `OrderStatus.MISSING_PAYMENT` |
| `b2bApprovalBusinessProcessStrategy` | (parent: `defaultB2BApprovalBusinessProcessStrategy`) | `processCode=customAccApproval`, `processName=CREATED` |
| `cleanUpFraudOrderJob` | `CleanUpFraudOrderJob` | CronJob czyszczący zamówienia fraud |
| `pickupConfirmationEventListener` | `PickupConfirmationEventListener` | nasłuchuje zdarzenia odbioru osobistego |
| `defaultEmailContextFactory` | `DefaultEmailContextFactory` | dodaje `commonResourceUrl` i `themeResourceUrl` do kontekstu emaila |

## Procesy biznesowe (kluczowe!)

| Nazwa procesu | Plik XML | Trigger | Opis kroków + kluczowe action handlery |
|---|---|---|---|
| `order-process` | `order-process.xml` | Zdarzenie złożenia zamówienia (B2C) | **UWAGA: większość flow jest zakomentowana.** Aktywny flow: `sendOrderPlacedNotification` → `success`. Zakomentowany pełny flow obejmuje: `checkOrderAction` → `checkAuthorizeOrderPaymentAction` → `reserveOrderAmountAction` → `checkTransactionReviewStatusAction` → `fraudCheckOrderInternalAction` → `prepareOrderForManualCheckAction` / `notifyCustomerAboutFraudAction` → `sendOrderPlacedNotificationAction` → `takePaymentAction` → `splitOrderAction` → `subprocessesCompletedAction` → `setOrderExpirationTimeAction` → `sendOrderCompletedNotificationAction` |
| `consignment-process` | `consignment-process.xml` | Podproces tworzony przez `splitOrderAction` (jedno consignment = jeden podproces) | `waitBeforeTransmissionAction` → `sendConsignmentToWarehouseAction` → wait `_WaitForWarehouse` → `receiveConsignmentStatusAction` → `allowShipmentAction` (DELIVERY: `sendDeliveryMessageAction` / PICKUP: `sendReadyForPickupMessageAction` → wait pickup → `confirmConsignmentPickupAction` → `sendPickedUpMessageAction`) / CANCEL: `cancelConsignmentAction` → `sendCancelMessageAction` → `subprocessEndAction` |
| `return-process` | `return-process.xml` | Zdarzenia `ConfirmOrCancelRefundEvent`, `ApproveOrCancelGoodsEvent` | `initialReturnAction` (ONLINE/INSTORE) → wait `ConfirmOrCancelRefundEvent` → `approveReturnAction` → `printReturnLabelAction` → `printPackingLabelAction` → wait `ApproveOrCancelGoodsEvent` → `acceptGoodsAction` → `captureRefundAction` → `successCaptureAction` → `taxReverseAction` → `successTaxReverseAction` → `inventoryUpdateAction` |
| `customAccApproval` | `customB2bAccOrderApproval.xml` | Tworzenie zamówienia B2B (`DefaultB2BCreateOrderFromCartStrategy`) | `checkMissingPaymentAction` → `approvalProcessStartAction` → `checkForApproval` → auto-approve (`changeOrderStatus` + `auditAutoApproval`) lub → `customFindApprovers` → workflow (`startWorkflow` / `customStartWorkFlowForAdmin`) → `sendOrderPendingApprovalNotification` → wait `APPROVAL_WORKFLOW_COMPLETE_EVENT` → `customCheckWorkflowResults` → `approvalProcessCompleteAction` / `sendOrderApprovalRejectionNotification` |

## Email procesy (jeśli są)

Rozszerzenie definiuje `defaultEmailContextFactory` (Velocity) z dodatkowymi zmiennymi kontekstowymi, ale szablony email (context.xml, `.vm`) nie są przechowywane bezpośrednio w tym rozszerzeniu. Powiadomienia są emitowane jako zdarzenia Spring (`OrderPlacedEvent`, `SendDeliveryMessageAction`, itp.) i obsługiwane przez `acceleratorservices`/storefront.

Zdarzenia emitowane przez action handlery:
- `OrderPlacedEvent` — `sendOrderPlacedNotificationAction`
- `OrderCompletedEvent` — `sendOrderCompletedNotificationAction`
- `SendDeliveryMessage` — `sendDeliveryMessageAction`
- `SendReadyForPickupMessage` — `sendReadyForPickupMessageAction`
- `SendPickedUpMessage` — `sendPickedUpMessageAction`
- `SendCancelMessage` — `sendCancelMessageAction`
- `OrderPaymentFailedEvent` — `sendPaymentFailedNotificationAction`

## Pułapki / gotchas

- **`order-process.xml` jest prawie pusty** — cały flow poza `sendOrderPlacedNotification → success` jest zakomentowany; zamówienia B2C przechodzą od razu do stanu SUCCEEDED bez walidacji płatności, fraud-check ani splitowania.
- **`MockProcess2WarehouseAdapter`** jest domyślnie aktywny jako alias `process2WarehouseAdapter` — w środowiskach produkcyjnych wymaga podmiany na właściwą implementację integracji z magazynem.
- **`return-process-spring.xml` importowany dwukrotnie** w `sniezkafulfilmentprocess-spring.xml` (duplikat `<import>` w linii 73–74) — nie powoduje błędu, ale jest nieścisłością.
- **`customAccApproval`** — proces B2B ma dwa beany strategii: `b2bApprovalBusinessProcessStrategy` (`processName=CREATED`) i `customAcceleratorMissingPaymentB2BApprovalBusinessProcessStrategy` (`processName=MISSING_PAYMENT`); obie muszą być zarejestrowane w `defaultB2BCreateOrderFromCartStrategy`.
- **`OrderApprovalB2BPermissionEvaluationStrategy`** — logika dla kontekstu PSB jest zakomentowana (dead code z komentarzem), co może wprowadzać błędy przy modyfikacjach.
- **`CheckMissingPaymentAction`** — jeśli zamówienie ma status `MISSING_PAYMENT`, proces B2B czeka na zdarzenie `${process.order.code}_PAYMENT_CONFIRMED`; zdarzenie musi być wysłane zewnętrznie.
- **Strategie splitowania** są aplikowane w określonej kolejności — zmiana kolejności w `strategiesList` może zmienić wynik podziału zamówienia na consignmenty.

