# sniezkabrandinitialdata

## Cel

Dostarcza dane inicjalizacyjne (core data) dla brand-stores Śnieżki — przede wszystkim dla portalu Magnat (`magnatBrand`). Tworzy `sniezkaBrandContentCatalog`, konfiguruje CMSSite, BaseStore, Solr oraz CMS pages/slots.

## Charakter

Rozszerzenie initialdata — importuje dane wymagane do uruchomienia brand-store na każdym środowisku. Nie zawiera danych testowych.

## Dependencies

- `sniezkainitialdata` (parent)
- `sniezkacore` (stałe, `SniezkaCoreConstants.BRAND_CONTENT_CATALOG_NAME`)

## Brand catalogs

- Jeden wspólny katalog contentowy: `sniezkaBrandContentCatalog` (Staged + Online)
- Języki katalogu: `pl`, `en`, `ru`
- Jeden BaseStore/CMSSite: `magnatBrand` / `magnatbrand`
- Produkt catalog: `sniezkaProductCatalog`

## Entry points

- `SniezkabrandinitialdataSystemSetup` — `@SystemSetup(type=PROJECT, process=ALL)`
- Dziedziczy `AbstractBrandSystemSetup`, który:
  1. Importuje pliki z `coreDataImportList`
  2. Tworzy i uruchamia sync jobs (content + product catalog)
  3. Wywołuje `ImpexImportService.importImpex()` (katalog `maintenance/`)
  4. Uruchamia indeksowanie (`sniezkaInspirationsAdvicesIndex`, `sniezkaSetPagesIndex`)

## Struktura import/

```
resources/sniezkabrandinitialdata/
  import/coredata/
    contentCatalogs/sniezkaBrandContentCatalog/
      catalog.impex             # definicja katalogu, CV, sync job
      cms-content.impex         # strony CMS, sloty, komponenty (+ _pl, _en, _ru)
      email-content.impex       # szablony e-mail dla brand-store
      inspirations_advices.impex
      message-bundles.impex
      custom-configuration.impex
    stores/magnatBrand/
      store.impex / site.impex  # BaseStore, CMSSite
      solr.impex / solr_products.impex / solr_sets.impex
  maintenance/
    current/                    # bieżące patche (importowane przez ImpexImportService)
    deployed_*/                 # zarchiwizowane patche
```

Kolejność importu sterowana przez `coreDataImportList` w `sniezkabrandinitialdata-spring.xml`.

Katalog `maintenance/` skanowany automatycznie przez `DefaultImpexImportService` wg property:
```
sniezkabrandinitialdata.main.directory.path=/sniezkabrandinitialdata/maintenance/
sniezkabrandinitialdata.directories.to.import=deployed,sprint,current
```

## Pułapki / gotchas

- Katalog `sniezkaBrandContentCatalog` jest **współdzielony** między `sniezkabrandinitialdata` i `sniezkabrandsampledata` — obie ext importują do tego samego CV.
- `AbstractBrandSystemSetup` wywołuje `performCatalogSync` **dwukrotnie** (przed i po `importImpex`).
- Patche z `maintenance/current/` są zawsze reimportowane przy każdym `update` — nie przenosić tam plików one-off.
- CMSSite `magnatbrand` ma url patterns zahardkodowane na domeny produkcyjne (`farbymagnat.pl`); na lokalu dostęp przez `?site=magnatbrand`.
