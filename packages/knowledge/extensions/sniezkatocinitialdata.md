# sniezkatocinitialdata

## Cel

Rozszerzenie initialdata dla **Śnieżka ToC** (Trade of Colours / kanał sprzedaży ToC). Importuje konfigurację SAP integracji (SAPConfiguration, OrgUnit, mapowania kanałów dystrybucji) oraz dane pomocnicze (MessageBundle, CustomConfiguration) specyficzne dla organizacji sprzedaży ToC (`JG1100`, kody `ZSTK`/`ZSTZ`).

## Charakter

Czyste **initialdata** — brak własnych typów, brak customizacji UI, brak nowych modeli danych. Jedyne artefakty Java to szkielet SystemSetup wygenerowany z szablonu Hybris.

## Dependencies

- `sniezkacore` (jedyna zależność w `extensioninfo.xml`)
- Korzysta z `DefaultImpexImportService` zdefiniowanego w `sniezkacore`

## Kluczowe items

| Typ | Zawartość |
|-----|-----------|
| `SAPConfiguration` | B2B Configuration — transactionType ZSB, salesOrg ZSTK, store `sniezka`; B2C Configuration — transactionType ZSC, salesOrg ZSTK, store `sniezkab2c` |
| `OrgUnit` + `Address` | Jednostki organizacyjne dla ZSTK i ZSTZ (kanały: 00, NI, NO) |
| `SAPProductSalesAreaToCatalogMapping` | Mapowania salesOrg × distChannel × taxCountry PL → `sniezkaProductCatalog:Staged` |
| `SAPPricingSalesAreaToCatalog` | Mapowania cennikowe dla ZSTK/ZSTZ |
| `ReferenceDistributionChannelMapping` / `ReferenceDivisionMapping` | Kanały dystrybucji i dywizje dla ZSTK/ZSTZ |
| `CustomConfiguration` | `b2b.avalaible.with.sales.arrangement.codes = ZGRTOC\|PLTOC`; `b2b.invoice.salesOrganisation.filter.codes = JG1000\|JG1100`; `foreign.customer.b2c.sales.org = ZSTZ` |
| `MessageBundle` | Etykiety `text.account.salesOrganisation.jg1100 = Śnieżka ToC` (pl/en/ru) |

## Spring beany

| Bean | Klasa |
|------|-------|
| `sniezkaTocInitialDataSystemSetup` | `TocInitialDataSystemSetup` (parent: `abstractSniezkaTocSystemSetup`) |
| `abstractSniezkaTocSystemSetup` | `AbstractTocSystemSetup` (abstract, parent: `abstractCoreSystemSetup`) |
| `initialDataTocImpexImportService` | `DefaultImpexImportService` z `sniezkacore` |

## Entry points (SystemSetup)

- `@SystemSetup(type=ESSENTIAL, process=ALL)` → `createEssentialData` — puste, nic nie robi
- `@SystemSetup(type=PROJECT, process=ALL)` → `createProjectData` — uruchamia `initialDataTocImpexImportService.importImpex()`

## Struktura import/

Katalog bazowy: `/sniezkatocinitialdata/impex/`  
Katalogi importowane (z `project.properties`): `deployed-ZPWS-530`, `deployed-ZPWS-778`, `deployed-ZPWS-509`

```
impex/
├── deployed-ZPWS-530/
│   ├── custom-configuration.impex   # invoice salesOrg filter
│   └── message-bundle-data.impex    # etykiety JG1000/JG1100
├── deployed-ZPWS-778/
│   └── custom-configuration.impex   # b2b sales arrangement codes (ZGRTOC|PLTOC)
└── deployed-ZPWS-509/
    ├── b2b-sap-custum-configuration.impex  # B2B SAPConfig + OrgUnit + mappings
    └── b2c-sap-custom-configuration.impex  # B2C SAPConfig + foreign customer sales org
```

## Pułapki / gotchas

- Literówka w nazwie pliku: `b2b-sap-custum-configuration.impex` (brak `o` w `custom`) — zmiana nazwy może zepsuć import, bo property `directoriesToImport` skanuje po nazwie katalogu, a nie pliku.
- `SAPProductSalesAreaToCatalogMapping` wskazuje na `sniezkaProductCatalog:Staged` — po synchronizacji katalogu produktowego trzeba upewnić się, że dane są dostępne w `Online`.
- Kolejność katalogów w `directories.to.import` ma znaczenie — impex `deployed-ZPWS-509` musi pojawić się po konfiguracji globalnej SAP (jeśli zależy od `GLOBAL` `SAPGlobalConfiguration`).
- Brak jakichkolwiek danych CMS ani contentCatalog — rozszerzenie dotyczy wyłącznie integracji SAP/B2B/B2C.
