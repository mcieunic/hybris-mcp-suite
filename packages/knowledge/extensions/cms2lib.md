# cms2lib

## Cel

`cms2lib` to biblioteka standardowych komponentów CMS dla SAP Commerce Cloud, dostarczająca gotowe typy itemów do budowy stron: bannery, karuzele produktów, listy produktów, slidery obrazów oraz komponenty szczegółów produktu. Rozszerzenie bazuje wyłącznie na `cms2` i nie zawiera własnych fasad ani serwisów biznesowych — jest czysto modelowa z minimalną logiką Spring. Stanowi punkt wyjścia dla customizacji acceleratorów (B2C/B2B), które nadpisują lub rozszerzają te komponenty.

## Charakter

| Właściwość        | Wartość                                                                 |
|-------------------|-------------------------------------------------------------------------|
| Typ               | Core library (brak web/storefront)                                      |
| Warstwa           | Model (items.xml) + minimal Spring (walidatory, predykaty, serwis)      |
| Zależności górne  | Wymaga `cms2`; sam nie jest wymagany przez żadne core ext (tylko accel) |
| Deployment tabele | 4 własne tabele relacji (BannForRotCompRels, ProdsForProdListCompRels, ProdsForProdCarCompRels, CatsForProdCarCompRels) |
| JSP tag library   | `cmstags.tld` — tagi `<cms:slot>`, `<cms:component>`, `<cms:body>`      |

## Dependencies

- `cms2` (jedyna zależność wymagana)

## Kluczowe items (najważniejsza sekcja!)

| code | extends | Atrybuty | Opis |
|------|---------|----------|------|
| `AbstractBannerComponent` | `SimpleCMSComponent` | `media` (localized:Media), `urlLink` (String), `external` (boolean) | Abstrakcyjna baza dla bannerów; `external` określa czy link otwiera nową kartę |
| `BannerComponent` | `AbstractBannerComponent` | `headline` (loc:String), `content` (loc:LONG_STRING), `pageLabelOrId` (jalo/ro) | Standardowy banner z nagłówkiem i treścią; `pageLabelOrId` jest read-only (jalo) |
| `FlashComponent` | `AbstractBannerComponent` | `play`, `loop`, `menu` (Boolean), `quality` (FlashQuality), `scale` (FlashScale), `wmode` (FlashWmode), `sAlign` (FlashSalign), `bgcolor` (String), `width`, `height` (Integer), `pageLabelOrId` | Komponent Flash (legacy); walidowany przez `FlashComponentValidator`; domyślnie `quality=best`, `wmode=transparent` |
| `RotatingImagesComponent` | `SimpleCMSComponent` | `timeout` (Integer), `effect` (RotatingImagesComponentEffect: zoom/fade/turnDown/curtainX) | Slider/karuzela bannerów; powiązany z `BannerComponent` przez relację M:N `BannersForRotatingComponent`; domyślny efekt `fade` |
| `ProductCarouselComponent` | `SimpleCMSComponent` | `scroll` (CarouselScroll: one/allVisible), `productCodes` (CMSStringList/jalo), `categoryCodes` (CMSStringList/jalo) | Karuzela produktów; produkty i kategorie ładowane przez Jalo (prefetch wyłączony explicite); M:N relacje z Product i Category |
| `ProductListComponent` | `SimpleCMSComponent` | `headline` (loc:String), `categoryCode` (jalo/ro), `productsFromContext` (boolean), `searchQuery` (loc:String), `pagination` (boolean), `layout` (ProductListLayouts: listViewLayout/thumbViewLayout), `productCodes` (CMSStringList/jalo) | Lista produktów z opcją paginacji i przełączania widoku; może pobierać produkty z kontekstu strony |
| `ProductDetailComponent` | `SimpleCMSComponent` | `productCode` (jalo/ro) | Szczegóły pojedynczego produktu wskazanego po kodzie (read-only jalo) |

**Enumy zdefiniowane w cms2lib:**

| Enum | Wartości |
|------|----------|
| `ProductListLayouts` | `listViewLayout`, `thumbViewLayout` |
| `RotatingImagesComponentEffect` | `zoom`, `fade`, `turnDown`, `curtainX` |
| `CarouselScroll` | `one`, `allVisible` |
| `FlashQuality` | `low`, `autolow`, `autohigh`, `medium`, `high`, `best` |
| `FlashScale` | `default`, `noorder`, `exactfit` |
| `FlashSalign` | `l`, `r`, `t`, `tl`, `tr` |
| `FlashWmode` | `window`, `opaque`, `transparent` |

**Relacje M:N:**

| Relacja | Source | Target | Tabela |
|---------|--------|--------|--------|
| `BannersForRotatingComponent` | `RotatingImagesComponent` | `BannerComponent` (list, ordered) | `BannForRotCompRels` |
| `BannersForContentPage` | `BannerComponent` | `ContentPage` | (bez deployment) |
| `FlashComponentsForContentPage` | `FlashComponent` | `ContentPage` | (bez deployment) |
| `ProductsForProductListComponent` | `ProductListComponent` | `Product` | `ProdsForProdListCompRels` |
| `ProductListComponentsForCategory` | `ProductListComponent` | `Category` | (bez deployment) |
| `ProductDetailComponentsForProduct` | `ProductDetailComponent` | `Product` | (bez deployment) |
| `ProductsForProductCarouselComponent` | `ProductCarouselComponent` | `Product` (list, ordered) | `ProdsForProdCarCompRels` |
| `CategoriesForProductCarouselComponent` | `ProductCarouselComponent` | `Category` (list, ordered) | `CatsForProdCarCompRels` |

## Services / Facades / Strategies

Brak dedykowanych fasad. Jeden serwis nadpisujący OOTB:

| Bean ID | Klasa | Opis |
|---------|-------|------|
| `cms2LibRelationBetweenComponentsService` (alias: `relationBetweenComponentsService`) | `Cms2LibRelationBetweenComponentsService` | Rozszerza `defaultRelationBetweenComponentsService`; obsługuje relacje między komponentami CMS; używa `typeService` i `cmsAdminContentSlotService` |

## Spring beany (selektywnie)

| Bean ID | Klasa / parent | Opis |
|---------|---------------|------|
| `flashComponentValidator` | `FlashComponentValidator` | Walidator interceptora dla `FlashComponent` |
| `flashComponentValidatorMapping` | `InterceptorMapping` | Rejestruje `flashComponentValidator` na typecode `FlashComponent` |
| `defaultProductCarouselComponentTypePredicate` (alias: `cmsProductCarouselComponentTypePredicate`) | parent: `cmsGenericTypePredicate` | Predykat typów dla `ProductCarouselComponent`; używany przez mechanizmy CMS do identyfikacji komponentu |

**JSP Tag Library (`cmstags.tld`, prefix `cms`):**

| Tag | Klasa | Opis |
|-----|-------|------|
| `<cms:slot>` | `CMSContentSlotTag` | Iteruje po komponentach slotu CMS (po uid, position lub obiekcie) |
| `<cms:component>` | `CMSComponentTag` | Renderuje komponent przez kontroler; opcjonalnie ewaluuje restriccje |
| `<cms:body>` | `CMSBodyTag` | Tag body potrzebny w trybie Live Edit |

## Restrictions

`cms2lib` nie definiuje własnych typów restrictions. Restrictions CMS (CMSCategoryRestriction, CMSProductRestriction, CMSUserRestriction, CMSGroupRestriction, CMSTimeRestriction) są zdefiniowane w rozszerzeniu `cms2` — `cms2lib` korzysta z nich pośrednio przez `SimpleCMSComponent`.

## Pułapki / gotchas

- Atrybuty `productCodes`, `categoryCodes` i `categoryCode` mają `persistence type="jalo"` i `write=false` — są read-only przez model, zapis odbywa się przez relacje M:N (np. `ProductsForProductCarouselComponent`). Próba ustawienia ich przez impex bezpośrednio nie zadziała.
- Prefetch modelu jest wyłączony explicite (`modelPrefetchMode=FALSE`) dla kolekcji `CMSStringList` — konieczne przy dużych listach produktów, ale może powodować N+1 queries jeśli wywołujesz iteracyjnie.
- `FlashComponent` to legacy (Flash Player EOL 2020); komponent istnieje w modelu dla kompatybilności wstecznej, nie należy go używać w nowych projektach.
- `BannersForContentPage` i `FlashComponentsForContentPage` nie mają deployment table — przechowywane w tabeli nadrzędnej (ContentPage), co przy dużej liczbie bannerów może spowalniać zapytania na ContentPage.
- `cms2lib` nadpisuje globalny alias `relationBetweenComponentsService` swoją implementacją — jeśli inny projekt też to nadpisuje, ostatni wygrywa (kolejność ładowania extensionów).
- Tag `<cms:component evaluateRestriction="true">` jest konieczny tylko gdy komponent jest renderowany poza slotem; w normalnym flow slot sam ewaluuje restriccje.

