# sniezkab2csampledata

## Cel

Dostarcza dane przykładowe (sample data) dla sklepu B2C Śnieżka (`sniezkab2cSite` / store `sniezkab2c`). Inicjalizuje katalog treści `sniezkaB2CContentCatalog`, dane produktowe w `sniezkaProductCatalog`, konta CMS, cronjob-y i warehouse. Uruchamia sync katalogów i indeksowanie Solr.

## Charakter

Czysto inicjalizacyjne — wywoływane podczas `PROJECT` data update. Nie zawiera własnych typów ani items.xml. Dla bieżących poprawek (po live) stosuje osobny mechanizm `maintenance/`, który importuje pliki ze zdefiniowanych katalogów (domyślnie: `deployed`, `sprint`, `current`).

## Dependencies

| Zależność            | Uwaga                        |
|----------------------|------------------------------|
| `sniezkasampledata`  | parent (wymaga w `extensioninfo.xml`) |

## Kluczowe items

Brak własnych typów — rozszerzenie nie definiuje `items.xml`.

## Spring beany

| Bean id                          | Klasa                                              | Uwagi                                                                 |
|----------------------------------|----------------------------------------------------|-----------------------------------------------------------------------|
| `sampleb2cDataImpexImportService`| `DefaultImpexImportService`                        | Importuje pliki z katalogu `maintenance/`; ścieżka i podkatalogi z `project.properties` |
| `sniezkab2csampledataSystemSetup`| `Sniezkab2csampledataSystemSetup`                  | Dziedziczy z `abstractSniezkaSystemSetup`; referencja do beana wyżej |

## Entry points (SystemSetup)

Klasa: `pl.sniezka.b2csampledata.setup.Sniezkab2csampledataSystemSetup`

`@SystemSetup(type = PROJECT, process = ALL)` → `createProjectData`:
1. Importuje listę hardkodowanych plików impex (patrz Struktura).
2. Uruchamia `sampleb2cDataImpexImportService.importImpex()` (pliki z `maintenance/`).
3. Synchronizuje katalogi: `sniezkaProductCatalog`, `sniezkaB2CContentCatalog`.
4. Uruchamia indeks Solr: `sniezkab2cIndex`.

## Struktura import/

```
resources/sniezkab2csampledata/
├── import/
│   ├── images/
│   │   └── banners/
│   │       ├── HomepageTopBanner1BGImage.png / HomepageTopBanner1MainImage.png
│   │       ├── HomepageTopBanner2BGImage.png / HomepageTopBanner2MainImage.png
│   │       ├── banner1-3.jpg
│   │       └── onBoarding/02–18.jpg
│   └── sampledata/
│       ├── cockpits/cmscockpit/
│       │   └── cmscockpit-users.impex        # użytkownicy CMS (cmsmanager, cmsmanager-sniezka), grupy, dostęp do CV
│       ├── contentCatalogs/sniezkaB2CContentCatalog/
│       │   ├── cms-content.impex             # strony FAQ, nawigacja, komponenty treści (pl), banery kategorii
│       │   ├── cms-content_pl.impex          # zlokalizowane treści PL
│       │   └── images/banners/               # advice01-02.png, banner1-3.jpg (lokalne kopie)
│       ├── product/set/media/                # zdjęcia przykładowych ProductSet (set01/set02)
│       └── stores/sniezkab2c/
│           ├── jobs.impex                    # ExportDataCronJob (Google Locations/Products), upload cronjob, navigationCategoryCronJob
│           └── warehouses.impex              # BaseStore2WarehouseRel → centralaSniezka
└── maintenance/
    ├── sprint6/
    │   ├── 01_SampleData.impex               # przykładowi klienci B2C (3 users + adresy), linki kategorii
    │   ├── 02_B2C_Recommendation_cart_page.impex
    │   ├── 03_SNH-12191-poczta_dostawa.impex
    │   ├── 04_SNH-12687.impex
    │   ├── 05_SNH-11304_TPAY.impex
    │   └── 06_product_capacity_symbol.impex
    ├── sprint7/
    │   ├── 01_SNH-31000_Homepage_Banners.impex  # HomepageBannerComponent (HomepageTopBanner1/2) + media
    │   ├── 04_SNH-467-navigation.impex
    │   ├── 05-zajawki-porad.impex
    │   ├── 06-ceneo-impex-fix.impex
    │   ├── 07_SNH-10252_onbarding_tresc.impex
    │   ├── 08_b2c-product-display-names.impex
    │   ├── 09-b2c-color-classifications.impex
    │   └── 10_SNH-16583_Icon_html_fragments.impex
    └── sprint8/
        ├── 01_Product_set_example.impex      # ProductSet, ProductSetFamily, ProductSetToProductHardRatio + media
        ├── 02-SNH-18768-category-description.impex
        └── 02-SNH-18886-calculators.impex
```

**Konfiguracja `maintenance/` w `project.properties`:**
```
sniezkab2csampledata.main.directory.path=/sniezkab2csampledata/maintenance/
sniezkab2csampledata.directories.to.import=deployed,sprint,current
```

## Pułapki / gotchas

- `maintenance/` importuje tylko podkatalogi wymienione w `sniezkab2csampledata.directories.to.import` (`deployed`, `sprint`, `current`). Pliki w `sprint6/`, `sprint7/`, `sprint8/` **nie są importowane automatycznie** — wymagają ręcznego uruchomienia lub zmiany konfiguracji.
- `HomepageBannerComponent` wymaga pola `bgImage` — bez niego kontroler rzuca NPE i strona główna wyświetla pustą karuzelę (owl).
- Katalog `sniezkaB2CContentCatalog` to odrębny od `sniezkaContentCatalog` katalog B2C — nie mylić z PL-owym `sniezkaContentCatalog` z `sniezkainitialdata`.
- Impex `cms-content.impex` jest bardzo duży (>28k tokenów); przy edycji zawsze czytaj fragmentami.
- `jobs.impex` używa `beforeEach` do pominięcia już istniejących cronjobów — bezpieczne przy wielokrotnym uruchomieniu.
