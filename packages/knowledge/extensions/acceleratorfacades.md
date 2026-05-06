# acceleratorfacades

## Cel

Rozszerzenie dostarcza fasady warstwy B2C Acceleratora, rozszerzające `commercefacades` o funkcjonalności specyficzne dla trybu akceleratora: pełny flow checkout (zwykły i ekspresowy), obsługę koszyka, wykrywanie urządzeń, obsługę płatności oraz karuzelę produktów. Stanowi obowiązkową warstwę pośrednią między kontrolerami storefront a serwisami commerce dla wszystkich custom storefrontów opartych na B2C Accelerator.

## Charakter

| Cecha | Wartość |
|---|---|
| Typ | Fasady + populatory + konwertery + DTOs |
| Brak items.xml | tak (brak własnych typów jalo/model) |
| Pakiet bazowy | `de.hybris.platform.acceleratorfacades` |
| Spring XML główny | `acceleratorfacades-spring.xml` |
| Dodatkowe Spring XML | `config/acceleratorfacades-cmsitems-spring.xml`, `config/acceleratorfacades-components-spring.xml`, `config/acceleratorfacades-pages-spring.xml`, `config/acceleratorfacades-visitors-spring.xml` |

## Dependencies

- `acceleratorcms`
- `commercefacades`
- `cmsfacades`

## Kluczowe items

Brak — rozszerzenie nie definiuje własnych typów (brak `items.xml`).

## Beans (DTOs)

| Klasa DTO | Opis |
|---|---|
| `DeviceData` | Dane urządzenia: userAgent, capabilities, flagi desktop/mobile/tablet |
| `UiExperienceData` | Poziom UX (`UiExperienceLevel`: DESKTOP/MOBILE) |
| `UrlEncoderData` | Atrybut URL-encodowany: nazwa, bieżąca i domyślna wartość |
| `UrlEncoderPatternData` | Wzorzec URL + flaga `redirectRequired` |
| `PaymentSubscriptionResultData` | Wynik subskrypcji płatności + `CCPaymentInfoData` (stored card) |
| `LeafDimensionData` | Jeden wymiar siatki wariantu: nagłówek, wartość, cena, sekwencja |
| `ReadOnlyOrderGridData` | Siatka zamówienia (only-read): mapa nagłówków + set `LeafDimensionData` + `ProductData` |
| `ProductWrapperData` | Opakowanie `ProductData` z komunikatem błędu (carousel/upload) |
| `CartWrapperData` | Opakowanie `CartData` z komunikatami success/error (CSV upload) |
| `CartEntryAction` (enum) | Akcje na pozycji koszyka — aktualnie: `REMOVE` |
| `OrderEntryData` (extension) | Dodaje pole `supportedActions: Set<String>` do OOTB DTO |
| `ConsignmentData` (extension) | Dodaje `statusDisplay: String` |
| `ImageData` (extension) | Dodaje `width: Integer` (responsive images) |
| `ProductData` (extension) | Dodaje `keywords: Set<String>` |
| `CartData` (extension) | Dodaje `importStatus: ImportStatus` (CSV import) |
| `BaseSiteData` (extension) | Dodaje `urlEncodingAttributes: List<String>` |
| `BaseStoreData` (extension) | Dodaje `expressCheckoutEnabled: boolean` |

## Services / Facades / Strategies (kluczowe!)

| Interfejs | Pakiet | Opis |
|---|---|---|
| `AcceleratorCheckoutFacade` | `order` | Rozszerza `CheckoutFacade` o express checkout, konsolidację pickup, szacowanie podatku, grupy flow |
| `CheckoutFlowFacade` | `flow` | Zarządzanie krokami i grupą flow checkout |
| `CartEntryActionFacade` | `cart.action` | Wykonywanie akcji na pozycji koszyka (dispatch do `CartEntryActionHandler`) |
| `CartEntryActionHandler` | `cart.action` | SPI dla handlerów akcji (REMOVE i custom) |
| `PaymentFacade` | `payment` | Tworzenie subskrypcji płatności kartą (tokenizacja, SilentPost) |
| `DeviceDetectionFacade` | `device` | Wykrywanie urządzenia z request (Spring Mobile) |
| `DeviceResolver` | `device` | Resolwuje `DeviceData` z HttpServletRequest |
| `ResponsiveMediaFacade` | `device` | Zwraca media w odpowiednim formacie dla urządzenia |
| `ProductCarouselFacade` | `productcarousel` | Pobiera produkty dla komponentu karuzeli CMS |
| `FutureStockFacade` | `futurestock` | Dostępność produktu w przyszłych datach |
| `OrderGridFormFacade` | `ordergridform` | Budowanie formularza siatki wariantów (multi-D) |
| `SavedCartFileUploadFacade` | `cartfileupload` | Import koszyka z pliku CSV |
| `CsvFacade` | `csv` | Eksport/import danych w formacie CSV |
| `EmailTemplateFacade` | `email` | Podgląd szablonów emaili CMS |
| `CustomerLocationFacade` | `customerlocation` | Geolokalizacja klienta (store locator) |
| `UrlEncoderFacade` | `urlencoder` | Kodowanie atrybutów w URL (język, waluta itp.) |

## Spring beany (selektywnie)

| Bean ID | Alias | Opis |
|---|---|---|
| `defaultAcceleratorCheckoutFacade` | `acceleratorCheckoutFacade` | Implementacja AcceleratorCheckoutFacade |
| `defaultCheckoutFlowFacade` | `checkoutFlowFacade` | Implementacja CheckoutFlowFacade (parent: `defaultAcceleratorCheckoutFacade`) |
| `accCartConverter` | `cartConverter` | Konwerter Cart→CartData (parent: `defaultCartConverter`) |
| `accOrderConverter` | `orderConverter` | Konwerter Order→OrderData |
| `accExtendedCartConverter` | `extendedCartConverter` | Rozszerzony konwerter koszyka |
| `accQuoteConverter` | `quoteConverter` | Konwerter Quote |
| `defaultAcceleratorCartPopulator` | `accCartPopulator` | Populator koszyka (dodany do chain przez listMergeDirective) |
| `accConsignmentPopulator` | `consignmentPopulator` | Populator przesyłki (adds statusDisplay) |
| `acceleratorGroupOrderEntryPopulator` | `groupOrderEntryPopulator` | Populator grup pozycji zamówienia |
| `accPickupOrderEntryGroupPopulator` | `pickupOrderEntryGroupPopulator` | Populator grupy pickup |
| `defaultProductKeywordsPopulator` | `productKeywordsPopulator` | Dodaje słowa kluczowe do ProductData |
| `defaultResponsiveMediaFacade` | `responsiveMediaFacade` | Responsive images |
| `responsiveImageConverter` | `responsiveImageConverter` | Konwerter obrazów responsywnych |
| `defaultPaymentFacade` | `paymentFacade` | Facade płatności kartą |
| `defaultProductCarouselFacade` | `productCarouselFacade` | Facade karuzeli produktów |
| `defaultUrlEncoderFacade` | `urlEncoderFacade` | URL encoding |
| `cartEntryActionHandlerRegistry` | — | Rejestr handlerów akcji koszyka (mapMergeDirective) |
| `defaultAccSitePopulator` | `accSitePopulator` | Populator BaseSite (dodaje urlEncodingAttributes) |
| `defaultBaseStoreExpressCheckoutPopulator` | — | Dodaje expressCheckoutEnabled do BaseStoreData |

## Wzorce do extendowania

- **Override aliasów fasad**: custom storefront definiuje własny bean (np. `customCheckoutFacade` extends `defaultAcceleratorCheckoutFacade`) i nadpisuje alias `checkoutFlowFacade` lub `acceleratorCheckoutFacade` w swoim `*-spring.xml`. Analogicznie dla `cartConverter`, `orderConverter`.
- **Populator chains (listMergeDirective)**: dołączanie własnych populatorów do konwerterów — np. dodanie własnego populatora do `accCartConverter`:
  ```xml
  <bean depends-on="accCartConverter" parent="listMergeDirective">
      <property name="add" ref="myCustomCartPopulator"/>
  </bean>
  ```
- **CartEntryActionHandler**: rejestracja nowej akcji przez `mapMergeDirective` do `cartEntryActionHandlerRegistry` (klucz: enum `CartEntryAction`, wartość: bean implementujący `CartEntryActionHandler`).
- **Konwertery i dependency lists**: każdy konwerter (np. `accCartConverter`) ma listę populatorów — można dodawać przez `listMergeDirective` bez modyfikacji oryginalnego XML-a.

## Pułapki / gotchas

- `AcceleratorCheckoutFacade` nie jest aliasem `checkoutFacade` — alias to `acceleratorCheckoutFacade`; kontrolery muszą wstrzykiwać właściwy bean.
- `CheckoutFlowFacade` (alias `checkoutFlowFacade`) domyślnie wskazuje na `sessionOverrideCheckoutFlowFacade`, który opakowuje `defaultCheckoutFlowFacade` — przy override trzeba pamiętać o tej podwójnej warstwie.
- Brak `items.xml` oznacza brak możliwości impexowania przez to rozszerzenie.
- `ResponsiveImageFormats` definiowane jako mapa konfiguracyjna — dodanie nowego formatu wymaga `mapMergeDirective`, nie podklasy.
- `ProductCarouselFacade` zależy od CMS — komponent musi istnieć w katalogu treści; błędy inicjalizacji komponentu cicho zwracają pustą listę.
- CSV upload (`SavedCartFileUploadFacade`) ustawia `importStatus` na CartData — brak sprawdzenia tego pola w kontrolerze prowadzi do milczącego ignorowania błędów importu.
- `DeviceDetectionFacade` bazuje na Spring Mobile (user-agent sniffing) — dla aplikacji SPA/headless wyniki będą zawsze „desktop".

