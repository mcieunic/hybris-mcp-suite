# sniezkabrandsampledata

## Cel

Dostarcza dane przykładowe (sample data) dla brand-stores — nadpisuje lub uzupełnia dane z `sniezkabrandinitialdata` o treści demo/QA, w tym sample produkty na stronach landing page i dodatkowe CMS content.

## Charakter

Rozszerzenie sampledata — importuje dane potrzebne do środowisk deweloperskich i testowych. Może być wyłączone na produkcji.

## Dependencies

- `sniezkabrandinitialdata` (bezpośredni parent)
- Pośrednio: `sniezkainitialdata`, `sniezkacore`

## Brand catalogs

- Ten sam katalog co initialdata: `sniezkaBrandContentCatalog` (Staged + Online)
- Ten sam BaseStore: `magnatBrand`
- Produkt catalog: `sniezkaProductCatalog`

## Entry points

- `SniezkabrandsampledataSystemSetup` — `@SystemSetup(type=PROJECT, process=ALL)`
- Dziedziczy `AbstractBrandSystemSetup` z `sniezkabrandinitialdata` — identyczna logika: import plików → sync → `ImpexImportService` → sync → index.
- Lista plików: `sampleDataImportList` w `sniezkabrandsampledata-spring.xml`.

## Struktura import/

```
resources/sniezkabrandsampledata/
  import/coredata/
    contentCatalogs/sniezkaBrandContentCatalog/
      cms-content.impex         # nadpisanie/uzupełnienie CMS (+ _pl, _en, _ru)
      custom-configuration.impex
    stores/magnatBrand/
      store.impex
      solr.impex / solr_pl / solr_en / solr_ru
  import/sampledata/products/
    product-landing-page.impex
    product-set-landing-page.impex
    landing-page-product-data.impex
    images/                     # obrazy placeholder dla landing pages
```

Katalog `maintenance/` nie istnieje — brak mechanizmu patchowania (skanowanie przez `DefaultImpexImportService` skonfigurowane w `sniezkabrandsampledata.main.directory.path` / `...directories.to.import`).

## Pułapki / gotchas

- Ext importuje do **tego samego** `sniezkaBrandContentCatalog` co `sniezkabrandinitialdata`; kolejność inicjalizacji ma znaczenie (initialdata musi być przed sampledata).
- Brak własnego `AbstractBrandSystemSetup` — klasa pochodzi z `sniezkabrandinitialdata`, więc zmiany tam wpływają na obie ext.
- Pliki landing-page zakładają istnienie konkretnych SKU w `sniezkaProductCatalog`; brak produktów = cichy brak treści, nie błąd importu.
