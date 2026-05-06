# acceleratorstorefrontcommons

## Cel
Rozszerzenie dostarcza wspólną bazę dla wszystkich storefrontów opartych na akceleratorze B2C/B2B: bazowe kontrolery stron (login, rejestracja, koszyk, kasa, CMS), interfejsy interceptorów (`BeforeControllerHandler`, `BeforeViewHandler`), mechanizmy security (authentication provider, brute-force counter, success/logout handler), buildery breadcrumbs oraz formularze i walidatory. Jest jedynym miejscem definiującym te kontrakty — każdy konkretny storefront (np. `sniezkastorefront`) je extenduje, nie reimplementuje. Extension leży w katalogu `deprecated/`, co oznacza, że SAP nie planuje jej dalszego rozwijania na rzecz Composable Storefront (Spartacus).

## Charakter

| Typ               | OOTB | Status                                |
|-------------------|------|---------------------------------------|
| Web shared library | yes  | deprecated (katalog deprecated/)      |

## Dependencies

- `acceleratorfacades`

## Kluczowe items

Brak własnych item types (plik `acceleratorstorefrontcommons-items.xml` jest pusty poza standardową strukturą).

## Services / Facades / Strategies (kluczowe!)

| Klasa / interfejs | Rola |
|---|---|
| `AbstractPageController` | Baza dla wszystkich page controllerów; wstrzykuje CMSPageService, CMSSiteService, ConsentFacade, MessageSource, SessionService, PageTitleResolver |
| `AbstractCMSComponentController<T>` | Baza dla kontrolerów CMS komponentów; obsługuje `handleGet` i resolwuje komponent po `componentUid` |
| `AbstractLoginPageController` | Baza logowania; dziedziczy z `AbstractRegisterPageController` |
| `AbstractRegisterPageController` | Baza rejestracji i guest checkout; obsługuje `AutoLoginStrategy`, `GUIDCookieStrategy`, `ConsentFacade` |
| `AbstractCartPageController` | Baza strony koszyka |
| `AbstractCheckoutController` | Baza checkout; deleguje do `acceleratorCheckoutFacade` |
| `AbstractCheckoutStepController` | Baza kroków checkoutu; obsługuje `CheckoutStep`, `CheckoutGroup` |
| `AbstractSearchPageController` | Baza stron wyszukiwania |
| `AbstractCategoryPageController` | Baza stron kategorii |
| `CheckoutStepController` | Bazowy kontroler do nawigacji między krokami checkoutu |
| `AbstractAcceleratorAuthenticationProvider` | Abstrakcyjny Spring Security authentication provider; blokuje login bez hasła i login adminów |
| `StorefrontAuthenticationSuccessHandler` | Post-login handler: przywraca/merge'uje koszyk, ładuje ustawienia użytkownika |
| `StorefrontLogoutSuccessHandler` | Post-logout handler |
| `GUIDCookieStrategy` | Zarządza anonimowym GUID cookie (potrzebny do anonimowego koszyka) |
| `AutoLoginStrategy` | Auto-login po rejestracji |
| `BruteForceAttackCounter` / `DefaultBruteForceAttackCounter` | Cache licznika nieudanych logowań (5 prób / 60 s / max 1000 wpisów) |
| `DefaultAcceleratorAccessDeniedHandler` | Obsługa 403 |
| `CartRestorationStrategy` / impls | Strategia przywracania koszyka po login; warianty: default, merging, no-op |
| `CustomerConsentDataStrategy` | Propagacja zgód (GDPR) do sesji |
| `BeforeControllerHandler` | Interfejs interceptora wykonywanego przed kontrolerem |
| `BeforeViewHandler` | Interfejs interceptora wykonywanego przed renderingiem widoku |
| `CheckoutStepValidator` / `AbstractCheckoutStepValidator` | Walidacja wejścia do kroku checkoutu |
| `CheckoutStepValidationAspect` | AOP aspect wokół `@PreValidateCheckoutStep` |
| `QuoteCheckoutStepValidationAspect` | AOP aspect wokół `@PreValidateQuoteCheckoutStep` |
| `ProductBreadcrumbBuilder` / `SearchBreadcrumbBuilder` / `ContentPageBreadcrumbBuilder` / `StorefinderBreadcrumbBuilder` | Buildery breadcrumbs |
| `VariantSortStrategy` / `DefaultVariantSortStrategy` | Sortowanie wariantów produktu |
| `AddressDataUtil` | Narzędzie do mapowania AddressData |
| `XSSFilterUtil` / `MetaSanitizerUtil` | Sanityzacja XSS i meta tagów |
| `Functions` / `JSONUtils` / `HTMLSanitizer` | Narzędzia JSP EL functions (functions.tld nie istnieje w tej extension — dostarczane przez konkretny storefront) |
| `GlobalMessages` | Statyczne metody do dodawania flash messages do modelu |

## Spring beany (selektywnie)

| Bean id | Klasa | Rola |
|---|---|---|
| `bruteForceAttackCounter` | `DefaultBruteForceAttackCounter` | Licznik brute-force; custom storefront może nadpisać przez `<alias>` |
| `abstractAcceleratorAuthenticationProvider` | `AbstractAcceleratorAuthenticationProvider` (abstract=true) | Baza — storefront definiuje konkretny bean z `parent="abstractAcceleratorAuthenticationProvider"` |
| `defaultAccessDeniedHandler` | `DefaultAcceleratorAccessDeniedHandler` | Handler 403; nadpisywany przez alias `accessDeniedHandler` w storefroncie |
| `cartRestorationStrategy` | `DefaultCartRestorationStrategy` | Alias; storefront może podmienić na `mergingCartRestorationStrategy` |
| `customerConsentDataStrategy` | `DefaultCustomerConsentDataStrategy` | Alias; deleguje do `defaultCustomerConsentDataStrategyDelegate` |
| `checkoutStepValidationAspect` | `CheckoutStepValidationAspect` | AOP; korzysta z `checkoutFlowGroupMap` i `acceleratorCheckoutFacade` |
| `quoteCheckoutStepValidationAspect` | `QuoteCheckoutStepValidationAspect` | AOP; korzysta z `quoteFacade` i `cartFacade` |
| `addressDataUtil` | `AddressDataUtil` | Alias; override rzadki |

## Entry points

- **Bazowe kontrolery stron**: `AbstractPageController`, `AbstractLoginPageController`, `AbstractRegisterPageController`, `AbstractCartPageController`, `AbstractCheckoutController`, `AbstractCheckoutStepController`, `AbstractSearchPageController`, `AbstractCategoryPageController`
- **Bazowy kontroler CMS komponentów**: `AbstractCMSComponentController<T>`
- **Filtry / handlery security**: `StorefrontAuthenticationSuccessHandler`, `StorefrontLogoutSuccessHandler`, `GUIDCookieStrategy`, `AutoLoginStrategy`, `AbstractAcceleratorAuthenticationProvider`
- **Interceptory**: interfejsy `BeforeControllerHandler` i `BeforeViewHandler` — implementacje rejestrowane w konkretnym storefroncie przez listy beanów
- **Tagi JSP**: `Functions`, `JSONUtils`, `HTMLSanitizer` (klasy pomocnicze); brak pliku `.tld` w tej extension — storefront dostarcza własny
- **Adnotacje**: `@RequireHardLogIn`, `@PreValidateCheckoutStep`, `@PreValidateQuoteCheckoutStep`

## Wzorce do extendowania (krytyczne!)

- **Authentication provider**: storefront definiuje konkretny bean z `parent="abstractAcceleratorAuthenticationProvider"` i nadpisuje metodę `additionalAuthenticationChecks`.
- **Kontrolery stron**: storefront tworzy konkretne klasy np. `LoginPageController extends AbstractLoginPageController`, dekoruje `@RequestMapping`, nie ma potrzeby rejestracji beana — komponent-scan go wykryje.
- **Kontrolery CMS komponentów**: `class MyComponentController extends AbstractCMSComponentController<MyComponentModel>`, implementacja metody `fillModel`.
- **BeforeControllerHandler / BeforeViewHandler**: storefront implementuje interfejs i rejestruje bean na liście `beforeControllerHandlers` / `beforeViewHandlers` w swoim Spring XML.
- **Cart restoration**: podmieniaj alias `cartRestorationStrategy` na `mergingCartRestorationStrategy` lub własną implementację.
- **Checkout steps**: definiuj `checkoutFlowGroupMap` z mapą `CheckoutGroup` → lista `CheckoutStep`; walidację kroku rozszerz przez `AbstractCheckoutStepValidator`.
- **Klasy bazowe do extendowania**: `AbstractPageController`, `AbstractCMSComponentController`, `AbstractLoginPageController`, `AbstractRegisterPageController`, `AbstractCheckoutStepController`, `AbstractCheckoutStepValidator`.

## Pułapki / gotchas

- Extension jest oznaczona `deprecated="true"` w `extensioninfo.xml`. SAP nie dodaje nowych funkcji; migracja oznacza przejście na Spartacus/Composable Storefront.
- Brak pliku `.tld` — functions EL (`fn:`) muszą być dostarczone przez konkretny storefront; pominięcie powoduje błędy JSP w czasie renderowania.
- `AbstractAcceleratorAuthenticationProvider` blokuje login adminów (`admingroup`) — nadpisanie bez uwzględnienia tej logiki tworzy lukę security.
- `BruteForceAttackCounter` trzyma stan **w pamięci** (Guava Cache), nie w sesji ani bazie; reset serwera usuwa historię prób.
- `StorefrontAuthenticationSuccessHandler` zależy od `UiExperienceService` — w środowiskach headless/API-only może rzucać NPE jeśli nie jest skonfigurowany.
- `@PreValidateCheckoutStep` działa przez AOP proxy (`proxy-target-class=true`) — klasy `final` lub wywołania wewnątrz klasy (self-invocation) nie zostaną przechwycone.
- Formularze i walidatory (`RegisterForm`, `AddressValidator` itp.) są w `commonweb/src` i muszą być na classpath storefrontu — zapewnia to budowa przez `commonweb`.
- Scan komponentów `de.hybris.platform.acceleratorstorefrontcommons` jest aktywny globalnie; duplikaty beanów z konkretnego storefrontu muszą być zarejestrowane **po** tym extension (kolejność spring XML ma znaczenie).