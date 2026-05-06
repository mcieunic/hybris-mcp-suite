# sniezkacommonweb

## Cel
Wspólna biblioteka webowa współdzielona przez wszystkie storefront'y Śnieżki (PL, CZ/SK). Zawiera bazowe filtry, renderery CMS, walidatory, strategie kalkulatora powierzchni, pomocnicze kontrolery oraz reusable tagi JSP. Nie jest samodzielnym storefront'em — jej kod jest importowany przez `sniezkastorefront` i `sniezkab2cstorefront`.

## Charakter

| Cecha        | Wartość                          |
|--------------|----------------------------------|
| Typ          | commonweb (biblioteka webowa)    |
| Kraj         | PL + CZ/SK (wspólna)            |
| Status       | aktywna, produkcyjna             |

## Dependencies

- `sniezkafacades`
- `assistedservicestorefront`
- `acceleratorstorefrontcommons`
- `sniezkaticketingc4cintegration`
- `cms2`
- `acceleratorcms`

## Kluczowe items

| Typ (code)                                    | Rozszerza              | Uwagi                                                                 |
|-----------------------------------------------|------------------------|-----------------------------------------------------------------------|
| `FreemarkerComponent`                         | `SimpleCMSComponent`   | CMS component z polem `freemarkerTemplate` (localized)               |
| `ExampleFreemarkerComponent`                  | `FreemarkerComponent`  | Przykładowy komponent Freemarker                                      |
| `HomepageBannerComponent`                     | `SimpleCMSComponent`   | Baner homepage: title, headline, image, imagePerson, bgImage, link, backgroundColor, url, hideButton |
| `HomepageInspirationAndAdviceSelectComponent` | `SimpleCMSComponent`   | Sekcja inspiracje/porady: tytuł + dwa obrazy z tekstem               |
| `ProductSetAddToCartComponent`                | `SimpleCMSComponent`   | Komponent zestawu produktów z Add-to-cart                            |
| `ToSComponent`                                | `SimpleCMSComponent`   | Komponent regulaminu (Terms of Service)                              |
| `YoutubeBannerComponent`                      | `SimpleCMSComponent`   | Baner YouTube: headline, content, videoId (wszystkie localized)       |
| `AbstractCMSComponent` (extend)               | —                      | Dodaje atrybuty `includePath` i `viewName` do bazowego typu CMS      |

## Services / Facades / Strategies

| Klasa / interfejs                        | Rodzaj    | Opis                                                         |
|------------------------------------------|-----------|--------------------------------------------------------------|
| `CustomBreadcrumbsBuilder`               | Builder   | Własna implementacja buildera breadcrumb'ów                  |
| `ExtendedProductBreadcrumbBuilder`       | Builder   | Rozszerzony builder breadcrumb'ów dla stron produktów        |
| `CustomDefaultCartRestorationStrategy`   | Strategy  | Nadpisuje `defaultCartRestorationStrategy`                   |
| `CustomVariantSortStrategy`              | Strategy  | Nadpisuje `defaultVariantSortStrategy`                       |
| `CalculatorProcessorStrategy`            | Strategy  | Interfejs procesora kalkulatora (sniezka, vidaron)           |
| `SniezkaCalculatorProcessorStrategy`     | Strategy  | Implementacja dla marki Śnieżka                              |
| `VidaronCalculatorProcessorStrategy`     | Strategy  | Implementacja dla marki Vidaron                              |
| `CalculatorViewStrategy`                 | Strategy  | Interfejs widoku kalkulatora (sniezka, magnat, vidaron)      |
| `CMSLogService` / `DefaultCMSLogService` | Service   | Logowanie komponentów CMS                                    |
| `ConfigurableCMSComponentRenderer`       | Renderer  | Własny renderer CMS, parent dla `cmsLoggingComponentRenderer` |
| `CMSLoggingCMSComponentRenderer`         | Renderer  | Renderer z logowaniem — rozszerza `configurableCMSComponentRenderer` |

## Spring beany (selektywnie)

| Bean id                              | Klasa                                          | Uwagi                              |
|--------------------------------------|------------------------------------------------|------------------------------------|
| `configurableCMSComponentRenderer`   | `ConfigurableCMSComponentRenderer`             | parent: `defaultCachingCMSComponentRenderer` |
| `cmsLoggingComponentRenderer`        | `CMSLoggingCMSComponentRenderer`               | parent: `configurableCMSComponentRenderer` |
| `cmsLoggingFilter`                   | `CMSLoggingFilter`                             |                                    |
| `loggingFilter`                      | `LoggingFilter`                                |                                    |
| `customDefaultCartRestorationStrategy` | `CustomDefaultCartRestorationStrategy`       | parent: `defaultCartRestorationStrategy` |
| `customVariantSortStrategy`          | `CustomVariantSortStrategy`                    | parent: `defaultVariantSortStrategy` |
| `customBruteForceAttackCounter`      | `DefaultBruteForceAttackCounter` (platforma)   | Własna konfiguracja licznika ataków |
| `customEmailValidator`               | `CustomEmailValidator`                         | w `sniezkacommonweb-spring.xml`    |
| `nipValidator`                       | `NipValidator`                                 | w `sniezkacommonweb-spring.xml`    |
| `phoneNumberValidator`               | `PhoneNumberValidator`                         | w `sniezkacommonweb-spring.xml`    |
| `postalCodeValidator`                | `PostalCodeValidator`                          | w `sniezkacommonweb-spring.xml`    |
| `abstractQualitativeComplaintUtils`  | `AbstractQualitativeComplaintUtils`            | abstract=true                      |
| `abstractQuantitativeComplaintUtils` | `AbstractQuantitativeComplaintUtils`           | abstract=true                      |
| `qualitativeComplaintFormValidator`  | `QualitativeComplaintFormValidator`            |                                    |
| `quantitativeComplaintFormValidator` | `QuantitativeComplaintFormValidator`           |                                    |
| `defaultCmsLogService`               | `DefaultCMSLogService`                         |                                    |

## Entry points

**Kontrolery (commonweb/src):**
- `AbstractConfigurableCMSComponentController` — baza dla CMS component controllerów
- `FreemarkerComponentController`, `ExampleFreemarkerComponentController` — obsługa komponentów Freemarker
- `AbstractInspirationAdvicePageController` — baza dla stron inspiracji/porad
- `ExtendedAbstractPageController` — rozszerzona baza page controllerów
- `AbstractComplaintController`, `AbstractCreateComplaintPageController`, `AbstractQualitativeComplaintController`, `AbstractQuantitativeComplaintController` — hierarchia controllerów reklamacji
- `PointOfServiceToJsonController`, `AbstractDataToJsonController` — endpointy JSON dla danych sklepów/danych ogólnych

**Filtry:**
- `StorefrontFilter`, `CMSSiteFilter`, `SeoUrlFilter` — główny pipeline request'u
- `MaintenanceBreakFilter` — obsługa przerwy technicznej
- `HealthCheckFilter` — endpoint healthcheck
- `CookieMachineNameFilter`, `RequestLoggerFilter`, `LoggingFilter`, `CMSLoggingFilter`
- `FileUploadFilter`, `StaticResourceFilter`, `UrlEncoderFilter`, `UrlPathFilter`, `AcceleratorAddOnFilter`

**Tagi JSP (commonweb/webroot/WEB-INF/tags/responsive):**
- `productCalculatorForm.tag`, `productCalculatorPopup.tag`, `productCalculatorResults.tag`
- `productCalculatorAreaCalculatedTab.tag`, `productCalculatorCalculateAreaTab.tag`
- Kalkulatory wewnętrzne (sniezka, magnat): `calculateAreaForm.tag`, `calculatedAreaForm.tag`, `calculatorResult.tag`, `calculatorTab.tag`

**Widoki JSP:**
- `freemarkercomponent.jsp`, `toscomponent.jsp`
- `sniezkaUsageCalculator.jsp`, `magnatUsageCalculator.jsp`, `vidaronUsageCalculator.jsp`

## Pułapki / gotchas

- `HomepageBannerComponent.bgImage` może być null — brak null-checka w kontrolerze powoduje NPE i pustą karuzelę Owl; zawsze sprawdzaj przed renderowaniem.
- Rozszerzenie nie jest storefront'em — nie ma własnego `web/src`; kod produkcyjny leży w `commonweb/src`, a zasoby w `commonweb/webroot`.
- Beany walidatorów (`nipValidator`, `phoneNumberValidator`, `postalCodeValidator`, `customEmailValidator`) są w osobnym pliku `sniezkacommonweb-spring.xml`, nie w web-spring — dostępne w całej aplikacji, nie tylko w kontekście webowym.
- `cmsLoggingComponentRenderer` nadpisuje domyślny renderer CMS — awaria loggingu może blokować renderowanie komponentów na stronie.
- Filtry (`MaintenanceBreakFilter`, `CMSSiteFilter`) są współdzielone przez PL i CZ/SK; zmiany w tym rozszerzeniu wpływają na oba storefront'y jednocześnie.

