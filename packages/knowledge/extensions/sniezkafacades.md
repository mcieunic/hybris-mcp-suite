# sniezkafacades

## Cel

Warstwa fasad pomiędzy `sniezkastorefront` / OCC a serwisami z `sniezkacore` i `sniezkaintegration`. Definiuje własne interfejsy fasad, konwertery, populatory oraz konteksty e-mail. Zawiera też crony eksportujące produkty i mechanizm powiadamiania o dostępności.

## Charakter

- Rozszerzenie **fasadowe** (brak items.xml, brak impexów).
- Customizuje kilkanaście konwerterów platformy przez `modifyPopulatorList` / `configurablePopulatorModification`.
- Nadpisuje kluczowe aliasy Spring: `cartFacade`, `acceleratorCheckoutFacade`, `customerFacade`, `orderPopulator`, `priceDataFactory`, `saveCartFacade`.
- Zawiera blisko 50 własnych interfejsów fasad.
- Definiuje niestandardowe ProductOption: `DOCUMENTS`, `SELECTED_PARAMS`, `SNIPPETS`.
- Rozszerza `ProductData` o ok. 40 dodatkowych pól (kolor, pojemność, packaging, sekcje, rich snippet, promotionsB2B itp.).

## Kluczowe items (beans.xml – rozszerzenia DTO)

| DTO | Kluczowe dodane pola |
|-----|----------------------|
| `ProductData` | `colorName/Code`, `capacity`, `ean`, `grossPrice`, `packaging`, `salesTags`, `richSnippet`, `features`, `promotions2B2BUnit`, `dekoratoriumLink`, `noindex` |
| `PointOfServiceData` | `loyaltyProgramType`, `mixer` |
| `PointOfServiceLocationData` | pełne dane mapy (geo, openingHours, images) |
| `CartData` / `OrderData` | rozszerzane przez `CustomCartPopulator`, `ExtendedOrderPopulator` (ADR, logisticalMinimum, PaymentMode, taxEntries) |

Własne bean-DTO: `InvoiceData`, `CreditReportData`, `UnclearedDocumentData`, `AssetData`, `InstalledBaseData`, `PaymentModeData`, `LogisticalMinimumData`, `AvailabilityNotificationData`, `ComplaintData` (jakościowa/ilościowa).

## Services / Facades / DAO / Strategy

| Interface | Kind | Implementacja | Co robi |
|---|---|---|---|
| `ExtendedProductFacade` | Facade | `DefaultExtendedProductFacade` | Rozszerza `ProductFacade` – pobiera brand/performance/capacity z klasyfikacji, produkty po baseCode z ignorowaniem approval status |
| `CustomCartFacade` | Facade | `ExtendedCartFacade` | Rozszerza `CartFacade` – payment modes, logistical minimum, flagi `priceUpdated`/`productRemoved` |
| `CustomB2BCartFacade` | Facade | impl. | Marker-interface dla B2B cart |
| `CustomB2CCartFacade` | Facade | impl. | Marker-interface dla B2C cart |
| `ExtendedCheckoutFacade` | Facade | `ExtendedB2BCheckoutFacade` | Checkout B2B – custom delivery address, payment mode, reorder, required realization date |
| `ExtendedB2CCheckoutFacade` | Facade | impl. | Checkout B2C |
| `InvoiceFacade` | Facade | impl. | Paginowane faktury, pobieranie PDF, akceptacja faktury, refresh z integracji |
| `BillingsFacade` | Facade | `BillingsFacadeImpl` | Raport kredytowy + nierozliczone dokumenty (CAR) |
| `AssetsFacade` | Facade | `DefaultAssetsFacade` | Maszyny/urządzenia klientów (InstalledBase) z sortowaniem po nazwie/dacie/statusie |
| `ComplaintFacade` | Facade | `ComplaintFacadeImpl` | Słownik kanałów komunikacji do reklamacji |
| `QualitativeComplaintFacade` | Facade | impl. | Reklamacje jakościowe (C4C) |
| `QuantitativeComplaintFacade` | Facade | impl. | Reklamacje ilościowe (C4C) |
| `AvailabilityNotificationFacade` | Facade | impl. | Zapis i przetwarzanie powiadomień o dostępności produktu |
| `PriceListFacade` | Facade | impl. | Generowanie cennika (PDF/XML) |
| `PalletReturnFacade` | Facade | impl. | Zwrot palet przez ticketing |
| `OnlinePaymentFacade` | Facade | impl. | Płatności online |
| `InspirationAdviceFacade` | Facade | `DefaultInspirationAdviceFacade` | Artykuły inspiracyjne/poradnikowe |
| `ContactFormFacade` | Facade | `DefaultContactFormFacade` | Formularze kontaktowe (ogólny, o produkcie, o marce) |
| `CategoryVisibilityFacade` | Facade | `DefaultCategoryVisibilityFacade` | Widoczność kategorii w nawigacji (Solr) |
| `ExtendedCustomerFacade` | Facade | `DefaultExtendedCustomerFacade` | Rejestracja B2B, usuwanie konta, integracja GUS |
| `ExtendedConsentFacade` | Facade | impl. | Zgody RODO |
| `SaveCartFacade` | Facade | `CustomSaveCartFacade` | Zapisane koszyki z custom logiką |
| `SimpleSuggestionFacade` | Facade | `DefaultSimpleSuggestionFacade` | Sugestie produktów do karuzeli |
| `SniezkaProductSearchFacade` | Facade | impl. | Wyszukiwanie produktów (Solr) |
| `B2BUnitContactsFacade` | Facade | impl. (extends `DefaultB2BUnitFacade`) | Kontakty jednostki B2B, switcher jednostek |
| `DistributorFacade` | Facade | `DefaultDistributorFacade` | Dane dystrybutorów |
| `DocumentDownloadFacade` | Facade | impl. | Pobieranie dokumentów |
| `ExcelFacade` | Facade | `DefaultExcelFacade` | Eksport/import koszyka przez Excel |
| `SiteBaseUrlResolutionFacade` | Facade | impl. | Resolwowanie base URL serwisu (email-y) |

## Spring beany worth knowing

| Bean (alias) | Klasa | Uwaga |
|---|---|---|
| `cartFacade` → `extendedCartFacade` | `ExtendedCartFacade` | Nadpisuje platformowy `cartFacade` |
| `acceleratorCheckoutFacade` → `extendedB2BCheckoutFacade` | `ExtendedB2BCheckoutFacade` | Nadpisuje checkout facade |
| `customerFacade` → `extendedCustomerFacade` | `DefaultExtendedCustomerFacade` | Nadpisuje `customerFacade` |
| `orderPopulator` / `orderListPopulator` → `extendedOrderPopulator` | `ExtendedOrderPopulator` | Nadpisuje konwerter zamówień |
| `priceDataFactory` → `customPriceDataFactory` | `CustomPriceDataFactory` | Własne locale mapping (pl/en/ru) |
| `cartPopulator` → `customCartPopulator` | `CustomCartPopulator` | Dodaje PaymentMode, LogisticalMinimum, PoS |
| `saveCartFacade` → `customSaveCartFacade` | `CustomSaveCartFacade` | Custom SaveCart |
| `imageFormatMapping` | `acceleratorImageFormatMapping` | Definiuje formaty: GBIG, GSMALL, LBANNER, 1200Wx1200H itp. |
| `categoryVisibilityFacade` | `DefaultCategoryVisibilityFacade` | Widoczność kategorii przez Solr |
| `catalogVisibilityHandler` | `DefaultCatalogVisibilityHandler` | AttributeHandler dla widoczności katalogu |
| `CmsUserUnitGroupsRestrictionEvaluator` | impl. | Ewaluator ograniczeń CMS po grupie B2B |
| `b2bUnitContactsFacade` | `B2BUnitContactsFacade` | Alias `extendedCartFacade.extendedB2BUnitFacade` |

## Entry points

- **REST OCC:** brak (fasady konsumowane przez `sniezkaocc` i `sniezkastorefront`)
- **Controllers:** konsumowane przez kontrolery w `sniezkastorefront` (InvoicesPageController, CheckoutController, ContactFormController, ComplaintsController itp.)
- **CronJoby:**
  - `AvailabilityCheckerJob` – sprawdza dostępność produktów i wysyła e-mail (`AvailabilityNotificationFacade.processNotifications`)
  - `ProductsExportMediaGeneratorJob` – generuje pliki feedów dla Ceneo, Facebook, GMC, Nokaut, Skapiec, Zaufane, Sniezka, Vidaron (XML/JSON)
  - `ExtendedSiteMapMediaJob` – rozszerzony job sitemapy
- **Business processes:** konteksty e-mail (`*EmailContext`) rejestrowane jako Spring beany `scope=prototype`, wykorzystywane przez procesy z `sniezkafulfilmentprocess`
- **Inne:** `CmsUserUnitGroupsRestrictionEvaluator` – ewaluacja custom ograniczeń CMS

## Dependencies

- **requires-extension:**
  - `b2bacceleratorfacades`
  - `acceleratorfacades`
  - `sniezkacore`
  - `sniezkaintegration`
  - `sniezkaassistedservicefacades`
  - `customerticketingfacades`
  - `sniezkaticketingc4cintegration`

- **external libs:** Flying Saucer / iText (PDF generation – `PdfGenerator`), JAXB (feeds XML), Apache POI / custom (Excel)

## Pułapki / gotchas

- `AvailabilityCheckerJob` hardkoduje katalog `sniezkaProductCatalog:Online` – nie zadziała bez modyfikacji dla rynku CZ/SK jeśli wymagane inne CV.
- `customPriceDataFactory` ma locale mapping tylko dla `pl`, `en`, `ru` – brak `cs`/`sk` spowoduje fallback do domyślnego locale; przy wdrożeniu CZ/SK należy ten mapping uzupełnić.
- `imageFormatMapping` definiuje własną mapę formatów obrazków – nadpisuje domyślną platformową; wszelkie nowe formaty mediów muszą być tu dodane.
- `CmsUserUnitGroupsRestrictionEvaluator` działa tylko dla `B2BCustomerModel` – anonimowi i B2C zawsze zwracają `false`.
- `customCommercePlaceOrderMethodHooks` – lista hooków przy składaniu zamówienia jest zarządzana przez `util:list`; dodanie nowego hooka musi uwzględniać kolejność (np. `overduePaymentsExceededCreditHook` blokuje złożenie zamówienia przy przekroczonym limicie kredytowym).
