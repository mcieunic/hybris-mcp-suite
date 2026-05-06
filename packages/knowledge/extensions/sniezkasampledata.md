# sniezkasampledata

## Cel

Dostarcza dane demonstracyjne (sample data) dla sklepu Śnieżka PL: testowych użytkowników B2B, przykładowe produkty z cenami i stanami magazynowymi, zawartość CMS (FAQ, sloty) oraz konfigurację środowiska developerskiego (cronjobs, magazyny, SEO URL). Nie jest używane produkcyjnie.

## Charakter

Rozszerzenie tylko z danymi — brak własnego modelu typów (`items.xml`). Zawiera wyłącznie impex + klasa `SniezkasampledataSystemSetup`. Po imporcie automatycznie uruchamia sync katalogów i indeksowanie Solr.

## Dependencies

- `sniezkab2cinitialdata` (jedyna zależność w `extensioninfo.xml`)
- Dziedziczy po `abstractSniezkaSystemSetup` z `sniezkainitialdata`

## Kluczowe items

| Typ | Zawartość |
|-----|-----------|
| `B2BUnit` / `B2BCustomer` | ~6 firm testowych (chemal, kobus, kamido, sewera…) z adresami, trybami płatności i dostawy |
| `UserPriceGroup` | grupy 1 i 2 |
| `Product` | ~30 SKU (pędzle 6PED-*, walki 6WAL-*, farby 1716-*, 1723-*) z EAN, cenami PLN, stock levels |
| `Category` | kody numeryczne (10–24, b2c-*) przypisane do `sniezkaProductCatalog` |
| `ContentPage` / `ContentSlot` | strony FAQ (5 kategorii × N pytań) + `FAQComponent`, `FAQContentSlot` |
| `CronJob` / `Trigger` | `googleLocationsSniezka`, `googleProductsSniezka`, `navigationCategoryCronJob`, `quoteToExpireSoonJob`, `quoteExpiredJob`, `exportCustomersCronJob`, `recalculateCartCronJob` |
| `StockLevel` | magazyn `centralaSniezka`, stany dla ~30 SKU |
| `SeoUrl` / `CustomConfiguration` | przykładowe reguły redirect/forward + `seo.url.enabled=true` |
| `Employee` | `CustomerSupportAdministrator`, `CustomerSupportManager`, `CustomerSupportAgent`, customer.support.1–8@sap.com |

## Spring beany

| Bean ID | Klasa |
|---------|-------|
| `sampleDataImpexImportService` | `pl.sniezka.core.configuration.service.impl.DefaultImpexImportService` |
| `sniezkasampledataSystemSetup` | `pl.sniezka.sampledata.setup.SniezkasampledataSystemSetup` |

`sampleDataImpexImportService` używa właściwości:
- `sniezkasampledata.main.directory.path` = `/sniezkasampledata/maintenance/`
- `sniezkasampledata.directories.to.import` = `deployed,sprint,current`

## Entry points (SystemSetup fazy)

Jedna metoda: `createProjectData` z adnotacją `@SystemSetup(type=PROJECT, process=ALL)`.

Kolejność wykonania:
1. Importuje sekwencję plików z listy `filesToImport` (przez `importImpexFile`)
2. Wywołuje `sampleDataImpexImportService.importImpex()` — skanuje foldery `maintenance/deployed`, `maintenance/sprint`, `maintenance/current`
3. `performCatalogSync` dla `sniezkaProductCatalog` i `sniezkaContentCatalog`
4. `performIndex` dla `sniezkaIndex`

## Struktura import/

```
resources/sniezkasampledata/
├── import/
│   ├── sampledata/
│   │   ├── backoffice/customersupport/      # users, groups, restrictions, savedqueries, ASM groups
│   │   ├── cockpits/
│   │   │   ├── cmscockpit/                  # users
│   │   │   ├── cscockpit/                   # users
│   │   │   ├── productcockpit/              # users
│   │   │   └── reportcockpit/               # users, mcc-links
│   │   ├── commerceorg/                     # B2BUnit/B2BCustomer, UserPriceGroup, CmsLog
│   │   ├── contentCatalogs/sniezkaContentCatalog/
│   │   │   ├── cms-content.impex            # FAQ pages, slots, nav nodes
│   │   │   ├── cms-content_pl.impex         # lokalizacje PL
│   │   │   ├── ymkt-sync.impex              # SAP Marketing sync
│   │   │   └── images/banners/              # banner1-3.jpg
│   │   ├── productCatalogs/sniezkaProductCatalog/
│   │   │   ├── categories.impex             # struktura kategorii
│   │   │   ├── categories_pl.impex / _en.impex
│   │   │   ├── categories-classifications.impex
│   │   │   ├── products.impex               # SKU, EAN, supercategories
│   │   │   ├── products_pl.impex / _en.impex
│   │   │   ├── products_media.impex         # zdjęcia produktów (jar:)
│   │   │   ├── products_prices.impex        # Europe1 PLN prices
│   │   │   ├── products_stocklevels.impex   # StockLevel → centralaSniezka
│   │   │   ├── products-classifications.impex / _pl.impex
│   │   │   └── images/300Wx300H/, 170Wx170H/, 600Wx600H/  # PNG produktów
│   │   └── stores/sniezka/
│   │       ├── jobs.impex                   # CronJob + Trigger
│   │       └── warehouses.impex             # BaseStore2WarehouseRel
│   ├── seo-url/
│   │   └── seo-url-test-data.impex          # SeoUrl + CustomConfiguration
│   └── stare impex - nie modyfikowac/       # archiwalne (nie importowane)
└── maintenance/
    ├── sprint4/                             # delivery modes, waga palety, currencies, approvalProcess, yrecommendation
    ├── sprint5/                             # minimum logistyczne, paragraf, kalkulator, coverage group, displayNames, user groups, invoice
    └── sprint7/                             # Opportunity download endpoint (CustomConfiguration)
```

## Pułapki / gotchas

- **Folder `stare impex - nie modyfikowac/`** — pliki nie są nigdzie importowane automatycznie; służą wyłącznie jako archiwum referencyjne.
- **Foldery maintenance** są importowane przez `sampleDataImpexImportService` z katalogu `maintenance/`, ale tylko podkatalogi `deployed`, `sprint`, `current` — sprint4/5/7 muszą być ręcznie umieszczone w jednym z tych folderów lub zaimportowane manualnie.
- **Produkty bez zatwierdzonego statusu** — `approvalStatus=approved` ustawiane dopiero przy przypisaniu ceny (w `products_prices.impex`), produkty bez ceny pozostają w statusie domyślnym.
- **Locale GERMAN w impexach produktowych** — `#% impex.setLocale( Locale.GERMAN )` na początku `products.impex` i `products_prices.impex`; błąd w tej linii blokuje cały import pliku.
- **Media ładowane przez `jar:`** — `$siteResource=jar:pl.sniezka.sampledata.constants.SniezkasampledataConstants&/...`; pliki muszą być w classpath rozszerzenia; konflikt z już istniejącymi mediami w `sys_master/` wymaga usunięcia folderu `sys_master/catalogsync/` przed ponownym importem.
- **Sync po imporcie** — `performCatalogSync` robi sync Staged→Online dla obu katalogów; bez tego produkty i CMS nie będą widoczne na storefront.
- **CronJob `navigationCategoryCronJob` bez baseStore** — w `jobs.impex` pominięto `baseStore` i `cmsSite`, co jest intencjonalne (globalny job).
- **Rozszerzenie nie definiuje własnych typów** — brak `items.xml`, brak migracji schematu; czysta warstwa danych.
