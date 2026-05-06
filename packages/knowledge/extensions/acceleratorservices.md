# acceleratorservices

## Cel
Rozszerzenie dostarcza warstwę serwisową wspólną dla wszystkich akceleratorów SAP Commerce (B2C, B2B). Obejmuje generowanie i wysyłkę emaili przez procesy biznesowe, obsługę płatności i fraud detection (symptomy blacklist/whitelist/first-time-order), resolwowanie URL-i per-site, mechanizmy importu danych przez hot folder (ImpEx batch) oraz silnik sitemap. Jest zależnością dla każdego projektu opartego na akceleratorze — bez niej procesy zamówień i emaili nie działają.

## Charakter

| Typ | Status |
|---|---|
| Services OOTB | Aktywne — używane przez wszystkie storefronty akceleratora (B2C/B2B) |

## Dependencies

- `cms2`
- `commerceservices`
- `ticketsystem`
- `springintegrationlibs`

## Kluczowe items

| Item | Extends | Opis |
|---|---|---|
| `EmailAddress` | — | Adres email (emailAddress + displayName), własna tabela |
| `EmailMessage` | — | Wiadomość email: subject, body, sent, sentDate, attachments |
| `EmailPage` | `DocumentPage` | Strona CMS do renderowania emaila; fromEmail/fromName (zlokalizowane) |
| `EmailPageTemplate` | `DocumentPageTemplate` | Szablon strony emaila; `subject` (RendererTemplate), `htmlTemplate` |
| `EmailAttachment` | `Media` | Załącznik emaila |
| `CartRemovalCronJob` | `CronJob` | CronJob usuwający stare koszyki |
| `UncollectedOrdersCronJob` | `CronJob` | CronJob obsługujący nieodebrane zamówienia click&collect |
| `SiteMapConfig` | — | Konfiguracja sitemap; języki/waluty, strony, template Velocity |
| `SiteMapMediaCronJob` | `CronJob` | Generuje pliki sitemap i zapisuje je jako media |
| `ExportDataCronJob` | `CronJob` | Eksport danych do 3rd-party (FTP/Google); pipeline-driven |
| `OrderModificationProcess` | `OrderProcess` | Proces modyfikacji zamówienia |
| `SavedCartFileUploadProcess` | `StoreFrontCustomerProcess` | Upload koszyka z pliku CSV |
| `CCPaySubValidation` | — | Walidacja subskrypcji karty płatniczej |
| `BaseSite` | — | Rozszerzenie o: cartRemovalAge, anonymousCartRemovalAge |
| `BaseStore` | — | Rozszerzenie o: expressCheckoutEnabled, taxEstimationEnabled, checkoutFlowGroup |
| `CMSSite` | — | Rozszerzenie o: urlEncodingAttributes, siteMaps, siteMapConfig |
| `DocumentPage` | `AbstractPage` | Bazowa strona dokumentu (email, pdf) |
| `DocumentPageTemplate` | `PageTemplate` | Bazowy template dokumentu z htmlTemplate (RendererTemplate) |
| `SolrPageRedirect` | `SolrAbstractKeywordRedirect` | Przekierowanie Solr do strony CMS |

## Services / Facades / Strategies (kluczowe!)

| Interfejs | Pakiet / klasa impl | Opis |
|---|---|---|
| `EmailService` | `email.impl.DefaultEmailService` | Wysyłka EmailMessage przez JavaMail |
| `EmailGenerationService` | `email.impl.DefaultEmailGenerationService` | Renderuje subject + body przez RendererService; tworzy EmailMessage |
| `CMSEmailPageService` | `email.impl.DefaultCMSEmailPageService` | Wyszukuje EmailPage po frontendTemplateName i CatalogVersion |
| `EmailTemplateService` | `email.impl.DefaultEmailTemplateService` | Pobiera RendererTemplate emaila |
| `SiteBaseUrlResolutionService` | `urlresolver.impl.DefaultSiteBaseUrlResolutionService` | Resolwuje bazowy URL serwisu (B2C/B2B) na podstawie konfiguracji i UrlEncoderService |
| `UrlEncoderService` | `urlencoder` | Koduje atrybuty URL (język, waluta) w URL-ach SEF |
| `SiteConfigService` | `config` | Pobiera właściwości konfiguracyjne per-site |
| `HostConfigService` | `config` | Pobiera właściwości konfiguracyjne per-host |
| `UiExperienceService` | `uiexperience` | Rozpoznaje typ UI (Desktop/Mobile) |
| `PaymentService` | `payment` | Obsługa płatności (CyberSource OOTB); tworzenie subskrypcji karty |
| `CheckoutPciStrategy` | `checkout.pci` | Strategia checkout w zależności od trybu PCI (HOP/SOP/Default) |
| `AcceleratorCheckoutService` | `order` | Rozszerza CommercCheckoutService o obsługę akceleratora |
| `FutureStockService` | `futurestock` | Pobiera informacje o przyszłych stanach magazynowych |
| `CustomerLocationService` | `customer` | Przechowuje lokalizację klienta (dla store finder) |
| `LocalStorePreferencesService` | `store` | Preferencje punktu odbioru klienta |
| `PickupPointOfServiceConsolidationStrategy` | `store.pickup` | Konsolidacja pozycji koszyka do jednego POS |
| `ProcessContextResolutionStrategy` | `process.strategies` | Rozwiązuje kontekst procesu (site, catalog, store) dla BusinessProcess |
| `DocumentGenerationService` | `document.service` | Generuje dokumenty PDF/HTML przez RendererService |
| `ExportDataProcessorService` | `dataexport.generic` | Przetwarza pipeline eksportu danych |

## Spring beany (selektywnie)

| Bean id | Klasa | Opis |
|---|---|---|
| `emailService` | `DefaultEmailService` | alias → `defaultEmailService`; wysyłka maili |
| `emailGenerationService` | `DefaultEmailGenerationService` | alias → `defaultEmailGenerationService`; renderowanie emaila |
| `emailContextFactory` | `DefaultEmailContextFactory` | Tworzy AbstractEmailContext dla procesu |
| `siteBaseUrlResolutionService` | `DefaultSiteBaseUrlResolutionService` | URL bazowy B2C/B2B z configurationService |
| `abstractGenerateEmailAction` | `GenerateEmailAction` | Bazowy bean akcji generowania emaila (abstract=true) |
| `sendEmail` | `SendEmailAction` | Wysyła wygenerowany EmailMessage |
| `removeSentEmail` | `RemoveSentEmailAction` | Usuwa EmailMessage po wysyłce |
| `abstractAction` | `AbstractAction` | Bazowy bean action dla processengine |
| `cartRemovalJob` | `CartRemovalJob` | Usuwa stare koszyki (anonimowe i użytkowników) |
| `uncollectedOrdersJob` | `UncollectedOrdersJob` | Wysyła reminder / tworzy ticket CS dla nieodebranych przesyłek |
| `acceleratorBlackListSymptom` | `AcceleratorBlackListSymptom` | Symptom fraud: blacklista adresów/kart |
| `acceleratorWhiteListSymptom` | `AcceleratorWhiteListSymptom` | Symptom fraud: whitelista |
| `acceleratorFirstTimeOrderSymptom` | `AcceleratorFirstTimeOrderSymptom` | Symptom fraud: pierwsze zamówienie |
| `exportDataJobPerformable` | `DefaultExportDataJobPerformable` | CronJob startujący pipeline eksportu |
| `siteMapMediaJob` | `SiteMapMediaJob` | Generuje sitemap XML jako media |
| `orderProcessContextStrategy` | `DefaultOrderProcessContextStrategy` | Resolwuje kontekst z OrderProcess |
| `consignmentProcessContextStrategy` | `DefaultConsignmentProcessContextStrategy` | Resolwuje kontekst z ConsignmentProcess |
| `quoteProcessContextStrategy` | `DefaultQuoteProcessContextStrategy` | Resolwuje kontekst z QuoteProcess |
| `storeFrontProcessContextStrategy` | `DefaultStoreFrontProcessContextStrategy` | Resolwuje kontekst z StoreFrontCustomerProcess |

## Procesy biznesowe OOTB

- `consignmentCollectionReminderProcess` — wysyła email z przypomnieniem o odbiorze przesyłki (3 kroki: generateEmail → sendEmail → removeSentEmail)
- `moveConsignmentToCustomerServicesProcess` — przenosi przesyłkę do działu CS i tworzy ticket w ticketsystem
- `savedCartFileUploadProcess` — tworzy koszyk z przesłanego pliku CSV (1 akcja: SavedCartFromUploadFileAction)
- `sendLoginVerificationTokenEmailProcess` — wysyła token weryfikacyjny przy logowaniu (passwordless / 2FA)
- `sendRegistrationVerificationTokenEmailProcess` — wysyła token weryfikacyjny przy rejestracji

Bazowa klasa akcji processengine: `AbstractSimpleDecisionAction` (z platform); `GenerateEmailAction` rozszerza ją jako bazowa akcja emaila.

## Email rendering

- Silnik renderowania: **Velocity** (`AbstractHybrisVelocityContext`, `CoreVelocityConfigurer`, `VelocityExecutor`); `RendererService` z platform-commons jest fasadą.
- Flow: `GenerateEmailAction` → `ProcessContextResolutionStrategy.initializeContext()` → `CMSEmailPageService.getEmailPageForFrontendTemplate(templateName, catalogVersion)` → `EmailGenerationService.generate(process, emailPage)` → `EmailContextFactory.create()` tworzy `AbstractEmailContext` → `RendererService.render(subjectTemplate, context)` + `render(bodyTemplate, context)` → `EmailService.create()` zapisuje `EmailMessageModel` → `SendEmailAction` wywołuje `EmailService.send()`.
- Resolucja template: po `frontendTemplateName` (String) i `CatalogVersionModel` — `EmailPage` musi istnieć w katalogu treści i mieć `masterTemplate` typu `EmailPageTemplate` z wypełnionym `htmlTemplate` i `subject` (oba jako `RendererTemplate`).
- Kontekst emaila (`AbstractEmailContext`) zawiera: title, displayName, email, fromEmail, fromDisplayName, email_language, dateTool (Velocity DateTool).

## Pułapki / gotchas

- `frontendTemplateName` musi dokładnie zgadzać się z `uid` strony `EmailPage` w katalogu treści — literówka powoduje ciche pominięcie (log WARN, Transition.NOK).
- `EmailPage` musi być w katalogu treści odpowiednim dla danego `BusinessProcess` — `CMSEmailPageService` szuka po `CatalogVersionModel` dostarczonym przez `ProcessContextResolutionStrategy`; zły katalog = brak emaila bez wyjątku.
- `EmailPageTemplate.htmlTemplate` i `EmailPageTemplate.subject` nie mogą być null — `DefaultEmailGenerationService` rzuca `IllegalStateException` (nie zwraca NOK).
- Po wysyłce emaila akcja `RemoveSentEmailAction` usuwa `EmailMessageModel` — debugowanie wymaga przechwycenia przed usunięciem.
- Fraud symptoms (`BlackList`, `WhiteList`, `FirstTimeOrder`) są rejestrowane jako beany — żeby działały, muszą być podpięte do `FraudService` z `commerceservices`.
- `SiteBaseUrlResolutionService` czyta `storefrontContextRoot` / `b2bStorefrontContextRoot` z properties — błędna konfiguracja powoduje nieprawidłowe URL-e w emailach.
- `CartRemovalJob` usuwa koszyki wg `cartRemovalAge` / `anonymousCartRemovalAge` z `BaseSite` — domyślnie może być null (brak usuwania).
- Hot folder (integration): konfiguracja w osobnym pliku `hot-folder-spring.xml`; `baseDirectory` to bean `java.lang.String` — musi wskazywać na istniejący katalog.
- Procesy Velocity używane w `SiteMapConfig.siteMapTemplate` to **inny** Velocity niż renderowanie emaili — kontekst jest inny (`SiteMapUrlEntriesContext`).

