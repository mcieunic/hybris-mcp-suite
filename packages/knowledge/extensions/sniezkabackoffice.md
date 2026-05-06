# sniezkabackoffice

## Cel
Rozszerzenie dostosowuje panel administracyjny Backoffice (SAP Commerce Cockpit NG) do wymagań projektu Śnieżka. Zawiera konfigurację widoków, edytorów i drzewa nawigacyjnego dla typów domenowych, a także nieliczne klasy Java nadpisujące standardowe zachowanie platformy.

## Charakter

| Atrybut  | Wartość                                   |
|----------|-------------------------------------------|
| Typ      | backoffice (Cockpit NG module)            |
| Kraj     | PL (wspólny dla wszystkich rynków)        |
| Status   | Aktywny, `backoffice-module=true`         |

## Dependencies

- `backoffice`
- `b2bcommercebackoffice`
- `platformbackoffice`
- `adaptivesearchbackoffice`
- `npmancillary`
- `sniezkacore`

## Kluczowe items

Brak — `sniezkabackoffice-items.xml` nie definiuje żadnych własnych typów (plik zawiera wyłącznie zakomentowany przykład).

## Services / Facades / Strategies

Brak własnych serwisów ani fasad. Rozszerzenie korzysta z `UsedPromoService` zdefiniowanego w `sniezkacore`.

## Spring beany (selektywnie)

| Bean ID                                    | Klasa                                                                        | Uwagi                                                                  |
|--------------------------------------------|------------------------------------------------------------------------------|------------------------------------------------------------------------|
| `customVariantAttributesSectionRenderer`   | `pl.sniezka.backoffice.variant.CustomVariantAttributesSectionRenderer`       | Alias nadpisuje `variantAttributesSectionRenderer`; fixes NPE dla null variant product |
| `sniezkabackofficeLabelLocator`            | `com.hybris.cockpitng.util.labels.ResourcesLabelLocator`                     | Rejestruje pliki etykiet `/sniezkabackoffice-backoffice-labels/labels` |
| *(anonymous)*                              | `CoverageCalculationStrategyMapping` + `ValidationBasedCoverageCalculationStrategy` | Rejestruje strategię pokrycia dla grupy `productAttributesCoverageGroup` |

## Konfiguracja Backoffice

### backoffice-config.xml — najważniejsze sekcje

- **Explorer-tree (nawigacja):**
  - Węzeł `hmc_treenode_marketing` — dodano typy `ExcludedDeliveryDay`, `ContactTopic`.
  - Węzeł `hmc_ticketsystemgroup` — dodano `PalletReturn`.
  - Węzeł `hmc.cms2 → hmc_treenode_filters` — dodano `ColorGroup`, `RoomType`, `ProductType`, `JobType`.
  - Węzeł `hmc_treenode_complaints` — dwa pod-węzły: reklamacje jakościowe (`QualitativeComplaint` i słowniki) oraz ilościowe (`QuantitativeComplaint` i słowniki).
  - Węzeł `hmc_treenode_catalog` — dodano `ProductSet`, `ProductDocument`, `ProductSetFamily`.

- **Editor-area (formularze):**
  - `B2BUnit` — rozbudowane zakładki: essentials (c4cId, ifsId, compositeIfsId), `hmc.administration` (pełna lista ~69 atrybutów), `hmc.tab.b2bunit.costcenter`, `hmc.tab.groups`, `hmc.tab.address`.
  - `Product` — sekcje: essentials (displayName, ifsCode), dokumenty produktowe, atrybuty YMKT (marketing), atrybuty fizyczne (grossWeight, netWeight, diameter…).
  - `Order` / `Cart` — essentials (ifsId), sekcje płatność/dostawa (costCenter, adrLicenceRequired, plannedRealizationDate, selectedShippingUnit).
  - `B2BCustomer` — pole `c4cId` w advanced-search.
  - `UserGroupB2BUnit` — custom label oraz advanced-search.
  - `ConsentTemplate`, `CMSParagraphComponent` — edytor WYSIWYG dla pól `description`/`content`.
  - `MessageBundle`, `CustomConfiguration` — essentials + listview + advanced-search.
  - `SeoUrl` — essentials + advanced-search.
  - `ProductDocument` — essentials + advanced-search + akcje (delete, sync).
  - `OrgUnit` — zakładka common z `deliveryModes`, `paymentModes`.
  - `User` — essentials z `c4cId`, `compositeIfsId`.

- **List-view (kolumny tabel):** skonfigurowane dla wszystkich powyższych typów domenowych (ExcludedDeliveryDay, PalletReturn, ContactTopic, ColorGroup, RoomType, ProductType, JobType, wszystkie typy reklamacji, ProductDocument, QuantitativeComplaint itp.).

- **Advanced-search:** konfiguracje pól dla większości typów domenowych.

- **Labels (base):** wyrażenia label dla ~20 typów, np. `'[' +code+ '] ' +name` lub wywołania `@labelService`.

### Niestandardowe widgety (cockpit ng widgets, action handlery)

| ID akcji                                                      | Klasa                                                    | Input      | Opis                                                          |
|---------------------------------------------------------------|----------------------------------------------------------|------------|---------------------------------------------------------------|
| `com.hybris.cockpitng.action.order.undousedpromotions`        | `pl.sniezka.backoffice.actions.order.UndoUsedPromotions` | `OrderModel` | Cofa wykorzystane promocje na zamówieniu; wywołuje `UsedPromoService.undo()`; wymaga potwierdzenia |

Akcja `confirmPickup` (Consignment) — skryptingowa (`com.hybris.cockpitng.actions.scriptingaction`, `model://confirmPickup`), nie jest własną klasą Java.

### Custom edytory

Brak własnych edytorów. Używane są standardowe edytory platformy, w tym `com.hybris.cockpitng.editor.localized(com.hybris.cockpitng.editor.wysiwyg)` dla pól HTML.

### Niestandardowe renderery

| Klasa                                      | Nadpisuje                              | Opis                                                                |
|--------------------------------------------|----------------------------------------|---------------------------------------------------------------------|
| `CustomVariantAttributesSectionRenderer`   | `VariantAttributesSectionRenderer`     | Dodaje null-check na `EditedVariantProduct`; zapobiega NPE w edytorze wariantów |

### Niestandardowe komponenty ZK

`sniezka-login.zul` + `CustomLoginFormComposer` — customizacja formularza logowania do Backoffice (inject `MessageBundleService`); `doAfterCompose` wywołuje tylko `super`.

### CSS / SCSS

- `mainpage_preprod.css` — nadpisanie stylu dla środowiska preprod.
- `login.scss` + `_login-variables.scss` — style formularza logowania.
- `sniezkabackoffice-variables.scss`, `_systembar-variables.scss`, `_perspectiveChooser-systembar-menu.scss` — globalne zmienne SCSS i styl systembar.

## Pułapki / gotchas

- `sniezkabackoffice-backoffice-widgets.xml` jest pusty — brak niestandardowych widgetów cockpit-ng; wszystkie customizacje idą przez `backoffice-config.xml`.
- `CustomVariantAttributesSectionRenderer` zawiera `LOG.info` na poziomie INFO w `getRenderedQualifiers` — może zaśmiecać logi na produkcji.
- `CustomLoginFormComposer` jest zarejestrowany w ZUL, ale sam w sobie nie robi nic poza `super.doAfterCompose` — jeśli `MessageBundleService` nie jest wstrzyknięty przez Spring, bean będzie pusty.
- Konfiguracja `B2BUnit → editor-area` jest podzielona na wiele oddzielnych bloków `<context>` — przy debugowaniu widoku konieczne jest przejrzenie całego pliku.
- Brak własnych typów w `items.xml` — rozszerzenie nie rozszerza modelu danych.

