# sniezkacpi

## Cel

Rozszerzenie integracyjne łączące Hybris z SAP CPI (Cloud Platform Integration / SCPI). Odpowiada za odbiór danych produktowych przesyłanych przez CPI iFlow i ich prawidłowe zapisanie w modelu Hybris — w szczególności cech klasyfikacyjnych (`ProductFeature`) oraz atrybutów wariantu kolorystycznego.

## Charakter

- Brak własnych itemtypes (items.xml pusty)
- Brak własnych endpointów HTTP ani własnego storefront
- Działa wyłącznie po stronie inbound — jako hook wywoływany podczas importu danych przez moduł `inboundservices`
- Klasa generatora (`SniezkacpiService`, `SniezkacpiSystemSetup`) to standardowy scaffold SAP, nie ma znaczenia biznesowego

## Dependencies

| Rozszerzenie | Rola |
|---|---|
| `sapcpiproductexchange` | Bazowy moduł SAP SCPI dla wymiany produktów; dostarcza interfejs `PrePersistHook`, właściwości konfiguracyjne delimitera |

## Kluczowe items

Brak własnych typów w `items.xml`. Rozszerzenie operuje na standardowych typach platformy:

- `ProductModel` / `VariantColorProductModel` (z `sniezkacore`)
- `ProductFeatureModel`
- `ClassAttributeAssignmentModel`, `ClassificationAttributeValueModel`

## Services / Facades / Strategies

| Interfejs | Implementacja | Opis |
|---|---|---|
| `SniezkacpiService` | `DefaultSniezkacpiService` | Scaffold SAP — tylko `createLogo` / `getHybrisLogoUrl`; nie ma znaczenia produkcyjnego |

Właściwa logika biznesowa jest w hooku, a nie w serwisie.

## Spring beany

| Bean id | Klasa | Opis |
|---|---|---|
| `sapCpiProductFeaturePersistenceHook` | `SapCpiProductFeaturePersistenceHook` | `PrePersistHook` wywoływany przed zapisem produktu z CPI; przetwarza cechy klasyfikacyjne i atrybuty koloru wariantu |
| `sniezkacpiService` | `DefaultSniezkacpiService` | Scaffold; zależności: `modelService`, `mediaService`, `flexibleSearchService` |
| `sniezkacpiSystemSetup` | `SniezkacpiSystemSetup` | Tworzy logo SAP przy INIT ESSENTIAL — bez znaczenia produkcyjnego |

## Konfiguracja CPI

### Delimiter kolekcji cech

Właściwość z `sapcpiproductexchange`:

```
sapcpiproductexchange.sapCpiProductFeaturePersistenceHook.collectionDelimiter = ,
```

Wartość **musi być zgodna** z właściwością `productFeatureCollectionDelimiter` ustawioną w SCPI iFlow po stronie CPI. Zmiana po jednej stronie bez drugiej spowoduje błędny podział wielowartościowych cech.

### Brak własnej konfiguracji OAuth / endpointów

Rozszerzenie nie definiuje własnych kanałów CPI, certyfikatów ani OAuth — to odpowiedzialność modułu `sapcpiproductexchange` i konfiguracji SCPI po stronie platformy integracyjnej.

## Główna logika hooka `SapCpiProductFeaturePersistenceHook`

Hook implementuje `PrePersistHook` i jest wywoływany dla każdego `ProductModel` importowanego przez CPI:

1. Rozdziela istniejące cechy (zapisane w DB) od nowych (niezapisane, `pk == null`)
2. Dla każdej nowej cechy: parsuje qualifier w formacie `classSystem/classVersion/featureId`, szuka `ClassAttributeAssignmentModel` w klasach klasyfikacji produktu
3. Konwertuje wartości string na właściwy typ (`BOOLEAN`, `ENUM`, `NUMBER`, `STRING`, `DATE`) — dla `ENUM` szuka `ClassificationAttributeValueModel` po kodzie
4. Obsługuje atrybuty wielowartościowe (`multiValued`) i zakresowe (`range`) — dla zakresu tworzy dwa osobne `ProductFeatureModel`
5. Usuwa nadmiarowe stare cechy, zapisuje nowe
6. Dla `VariantColorProductModel`: wypełnia `colorName` (zlokalizowane ze wszystkich locale) z atrybutu `ID_KOLOR_NAZWA` oraz `colorCode` (PL locale) z `ID_KOLOR_KOD`

## Pułapki / gotchas

- **Delimiter musi być zsynchronizowany z CPI iFlow** — domyślnie `,`; różnica powoduje brak podziału listy wartości lub błędne feature values
- **Fallback dla nieistniejących wartości ENUM** jest wyłączony domyślnie (`impex.nonexistend.clsattrvalue.fallback.enabled=false`) — linia jest oznaczana jako nierozwiązana i reimportowana w kolejnym przebiegu; włączenie fallbacku spowoduje zapis jako String zamiast `ClassificationAttributeValueModel`
- **Qualifier format** musi mieć dokładnie 3 segmenty oddzielone `/` (`classSystem/classVersion/featureId`) — inaczej hook zwraca `null` dla `ClassAttributeAssignmentModel` i cecha jest pomijana
- **`setColourNameForVariant`** iteruje po wszystkich `supportedLocales` platformy — brak locale na liście platform i18N = brak tłumaczenia nazwy koloru
- **`sniezkacpiService` to scaffold SAP** — nie należy go mylić z produkcyjną logiką; jedyna realna klasa to `SapCpiProductFeaturePersistenceHook`
- Rozszerzenie nie ma własnych itemtypes — zmiany w modelu danych wymagają modyfikacji `sniezkacore`

