# sniezkaocc

## Cel

Eksponuje dedykowany REST endpoint OCC dla integracji z wyszukiwarką **Luigi's Box** — dostarcza pełny feed produktów i kategorii na potrzeby indeksowania po stronie Luigi's Box.

## Charakter

Minimalne rozszerzenie OCC (brak własnych items, brak własnego Spring bean-a poza auto-scanem kontrolera). Rejestruje się jako moduł webowy pod `/occ/v2`. Cały kod to jeden kontroler REST + dwa POJO DTO generowane z `sniezkaocc-beans.xml`.

## Kluczowe items

Brak własnych typów w `sniezkaocc-items.xml` (plik jest szkieletem bez żadnych definicji).

## Services / Facades / DAO / Strategy

| Interface / Klasa | Kind | Implementacja | Co robi |
|---|---|---|---|
| `ExportProductService` | Service (platform) | `exportProductService` | Pobiera wszystkie produkty (`getAllProducts`) lub zmodyfikowane od timestampu (`getModifiedProducts`) z danego CV |
| `CatalogVersionService` | Service (platform) | `catalogVersionService` | Rozwiązuje `CatalogVersionModel` z parametrów `catalog`+`version` lub z sesji |
| `ExtendedProductService` | Service (sniezkacore) | `extendedProductService` | Pobiera wartość cechy klasyfikacyjnej produktu po kodzie (pojemność) |
| `CustomCategoryService` | Service (sniezkacore) | `customCategoryService` | Zwraca root-kategorie dla danego CV |
| `CustomCategoryModelUrlResolver` | UrlResolver (sniezkacore) | `customCategoryModelUrlResolver` | Tworzy URL kategorii zależny od języka sesji |
| `CustomConfigurationService` | Service (sniezkacore) | `customConfigurationService` | Czyta konfigurację (klucz `environment.type`, `sniezka.product.capacity.id`) |
| `CommonI18NService` | Service (platform) | `commonI18NService` | Konwersja iso kodu języka na `Locale`/`LanguageModel` |
| `CMSSiteService` | Service (platform) | `cmsSiteService` | Pobiera aktualny `CMSSiteModel` (do wyznaczenia języków serwisu) |
| `UrlResolver<ProductModel>` | UrlResolver (platform) | `productModelUrlResolver` | Tworzy URL produktu |
| `SessionService` | Service (platform) | `sessionService` | Wykonanie logiki w lokalnym kontekście sesji (zmiana języka dla URL-i kategorii) |

## Spring beany worth knowing

Brak własnych bean-ów zadeklarowanych ręcznie. Kontroler `LuigisboxProductsController` jest wykrywany przez `<context:component-scan base-package="pl.sniezka.controllers"/>` w `sniezkaocc-web-spring.xml`.

## Entry points

### REST OCC

Bazowy prefix modułu: `/occ/v2` → pełna ścieżka: `/occ/v2/{baseSiteId}/luigisbox/...`

| Metoda HTTP | Ścieżka | Bezpieczeństwo | Parametry | Zwraca |
|---|---|---|---|---|
| `GET` | `/{baseSiteId}/luigisbox/categories` | `ROLE_TRUSTED_CLIENT` + `@SecurePortalUnauthenticatedAccess` | `currentPage` (def. 0), `pageSize` (def. 20), `catalog`, `version`, `timestamp` (ISO-8601), `languages` (csv) | `List<LuigiCategoryData>` |
| `GET` | `/{baseSiteId}/luigisbox/products` | `ROLE_TRUSTED_CLIENT` + `@SecurePortalUnauthenticatedAccess` | `currentPage` (def. 0), `pageSize` (def. 20), `catalog`, `version`, `timestamp` (ISO-8601), `languages` (csv) | `List<LuigiProductData>` |

#### `LuigiCategoryData` — pola odpowiedzi

`code`, `name` (Map lang→wartość), `url` (Map lang→url), `subcategories` (rekurencyjnie)

#### `LuigiProductData` — pola odpowiedzi

`code`, `name`, `displayName`, `description`, `summary`, `performance`, `capacity`, `packaging` (wszystkie Map lang→wartość), `ean`, `supercategories` (csv kodów), `colorName`, `colorCode`, `colorRGBValue`, `diameter`, `width`, `ymktCommonName`, `thumbnail`, `imageURL`, `url`, `priceGroups` (List<String>), cechy klasyfikacyjne: `id_aplik_ilosc_warstw`, `id_metoda_aplikacji`, `id_efekt_wykonczenia`, `id_jezyk_na_front_opak`, `id_jezyk_opak`, `id_kolor_grupa`, `id_kolor_nazwa`, `id_material_rodzina`, `id_marka`, `id_kategoria`, `id_linia_biznesowa`, `id_granulacja`, `id_rozmiar`, `id_rodzaj_bazy_sk`

### Controllers

- `pl.sniezka.controllers.LuigisboxProductsController`

### CronJoby

Brak.

### Business processes

Brak.

### Inne

- Endpoint `products` obsługuje **eksport inkrementalny** gdy podany jest `timestamp`: filtruje produkty zmodyfikowane po danej dacie (przez `ExportProductService.getModifiedProducts`).
- Endpoint `categories` zwraca **tylko kategorie B2B** (te posiadające `siteChannel` z kodem zawierającym `"B2B"`).
- Obrazek produktu: preferuje format `300Wx300H` z pierwszego `galleryImages` kontenera; fallback na `picture`.
- URL mediów: na środowisku `prd` konstruuje URL przez konkatenację stałego prefiksu `https://static.sniezka.pl/sys-master/` z `media.location`; na pozostałych środowiskach używa `media.getURL()`.

## Dependencies

- **requires-extension:** `commercewebservices`, `sniezkacore`
- **external libs:** brak (plik `external-dependencies.xml` jest pusty)

## Pułapki / gotchas

- Katalog produktowy jest hardkodowany jako `sniezkaProductCatalog:Online` w logice `getCategories` — endpoint kategorii ignoruje parametry `catalog`/`version` i zawsze wymusza ten konkretny CV.
- Jeśli `baseSite` nie jest ustawiony w sesji (brak `cmsSiteService.getCurrentSite()`), endpoint rzuca `RuntimeException` zamiast HTTP 4xx — brak graceful error handling.
- `ClassificationAttributeValueModel` ze stałą `VARIANT_COLOR_CODE_ZZ` jest filtrowany do `null` w wartościach lokalizowanych cech klasyfikacyjnych (logika w `getLocalizedValuesForClassification`).
- Wartość `pageSize` domyślna to **20**, nie standardowe 100 OCC — przy dużych katalogach wymaga ręcznej paginacji po stronie klienta Luigi's Box.
- Wymagana rola `ROLE_TRUSTED_CLIENT` — wywołanie musi przejść przez OAuth2 z odpowiednim klientem (np. `trusted_client`).
