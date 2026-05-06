# y2y

## Cel

Rozszerzenie umożliwiające migrację danych między środowiskami Hybris (Hybris-to-Hybris). Łączy się z HAC (Hybris Administration Console) źródłowego środowiska, pobiera dane przez FlexibleSearch i importuje je impexem do środowiska docelowego. Używane do synchronizacji danych B2B (klienci, jednostki, produkty, wiadomości) między środowiskami, np. QA → lokalny.

## Charakter

- Typ: core extension (brak webmodule), brak modułu storefront
- Dostawca: **Bilot sp. z o.o** (2020–), wcześniej SI-eCommerce i Hycom; właściciel IP: **FFIL Śnieżka SA**
- Package root: `pl.bilot.y2y`
- Konfiguracja reguł eksportu dla Śnieżki w submodule git: `resources/y2y/import/exportRules/Sniezka/y2ysniezkarules/`

## Dependencies

- `core`
- `commerceservices`
- `hac`

Biblioteki zewnętrzne (przez maven): Apache HttpClient, Jsoup, Gson, Apache Commons Text/Lang, Log4j.

## Kluczowe items

| Typ | Opis |
|---|---|
| `ImportDataCronJob` (extends `CronJob`) | Profil importu: URL źródła, login/hasło (encrypted), lista ExportRule, flaga `saveImportImpexes`, params |
| `ExportRule` | Definicja jednej reguły: `exportQuery` (FlexibleSearch na źródle), `importHeader` (nagłówek impex), `columns`, `targetType`, `batchSize` (domyślnie 500), `retries` (5), `timeout` (120s), `maxCount` (-1 = bez limitu) |
| `ExportPkMatrix` | Tabela mapowania PK źródło→cel, używana przy regułach potomnych (child rules) |

Relacje:
- `ExportRules`: `ImportDataCronJob` ↔ `ExportRule` (many-to-many)
- `ExportRules2ChildExportRules`: `ExportRule` ↔ child `ExportRule` (many-to-many, ordered)

## Beans (DTO)

Brak zdefiniowanych beanów w `y2y-beans.xml`.

## Services / Facades / Strategies

Brak dedykowanych serwisów/fasad — logika całkowicie w `ImportDataJobPerformable`.

## Spring beany

| Bean ID (alias) | Klasa | Opis |
|---|---|---|
| `y2ySystemSetup` | `Y2YSystemSetup` | Setup systemowy przy inicjalizacji |
| `y2yHacHttpClient` | `DefaultY2YHacHttpClient` | Klient HTTP do komunikacji z HAC |
| `y2yCookieParser` | `DefaultY2YCookieParser` | Parser cookies sesji HAC |
| `importDataJobPerformable` | `ImportDataJobPerformable` | Performable CronJob (autowired przez `@Service`) |

## Entry points

- **CronJob**: `ImportDataJobPerformable` — główny punkt wejścia. Uruchamiany przez `ServicelayerJob` z `springId=importDataJobPerformable`.
- **Profile impex**: `resources/y2y/import/exportRules/Sniezka/y2ysniezkarules/profiles.impex` — tworzy ExportRule i ImportDataCronJob dla konkretnych środowisk (QA_Complete, QA_B2BUnits, QA_Customers itd.).
- **HAC endpoint źródła**: `POST /console/flexsearch/execute` — do pobierania danych; `POST /console/scripting/execute` — do Groovy.

### Predefiniowane profile (Śnieżka)

| CronJob | Reguły |
|---|---|
| `QA_Complete` | wszystkie reguły: messageBundle, userGroups, b2bUnits\*, customers\*, products |
| `QA_B2BUnits` | b2bUnits + 4 relacje |
| `QA_Customers` | customers + customers2groups |
| `QA_Stores` | stores |
| `QA_Products` | products |
| `QA_UserGroups` | userGroups |

### Reguły (ExportRule) — Śnieżka

Zdefiniowane przez `.fxs` (export query FlexibleSearch) + `.impex` (import header):
`messageBundle`, `stores`, `b2bUnits`, `b2bUnits2groups`, `b2bUnits2stockDistributors`, `b2bUnits2billTo`, `b2bUnits2soldTo`, `userGroups`, `customers` (B2BCustomer), `customers2groups`, `products` (z wariantem child `variants`).

## Pułapki / gotchas

- `clearPKMatrix` usuwa rekordy `ExportPkMatrix` przed każdym uruchomieniem bezpośrednim SQL-em (`DELETE`). Obsługuje tylko **MySQL i HANA** — inne bazy rzucają `ExportException`.
- SSL walidacja wyłączona (`NoopHostnameVerifier`, trust-all) — celowe dla połączeń między środowiskami z self-signed certami.
- Hasła w `ImportDataCronJob` są encrypted (atrybut `encrypted="true"` w items.xml), ale profil `profiles.impex` zawiera je plaintextem — impex należy traktować jako poufny.
- Kolejność kolumn w `columns` musi dokładnie odpowiadać kolejności w `importHeader` — rozbieżność spowoduje ciche nadpisanie złych pól.
- Reguły child (`childExportRules`) wymagają `?pks` w `exportQuery`; brak powoduje `ExportException` z czytelnym komunikatem.
- `saveImportImpexes=true` zapisuje wygenerowane impeksy do `$HYBRIS_DATA_DIR/externalData/impexes/<cronJobCode>/` — przydatne do debugowania, ale zajmuje miejsce.
- Submoduł git z regułami Śnieżki (`y2ysniezkarules`) jest niezależnym repo — wymaga `git submodule update --init --recursive` po klonowaniu projektu.
