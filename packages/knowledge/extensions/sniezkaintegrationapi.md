# sniezkaintegrationapi

## Cel
Rozszerzenie definiuje kontrakt integracyjny Śnieżki z systemami zewnętrznymi: zbiór interfejsów `Gateway` (wzorzec anti-corruption layer) oraz towarzyszące DTO/bean klasy używane przy wywołaniach do SAP S/4, C4C, IFS, GUS i SAP Marketing. Rozszerzenie nie zawiera żadnych implementacji — dostarcza wyłącznie API (interfejsy + wyjątek `ServiceException`), z jedynym wyjątkiem `MockTicketGateway` do lokalnych testów. Używane jest jako zależność przez `sniezkacore`, `sniezkaintegration` i `sniezkaintegrationws`.

## Charakter

| Cecha | Wartość |
|---|---|
| Typ rozszerzenia | API-only (core, brak web) |
| Implementacje | Brak — tylko interfejsy i DTO |
| Wyjątek integracyjny | `pl.sniezka.integrationapi.exception.ServiceException` |
| Mock w Spring | `mockTicketGateway` (impl `MockTicketGateway`, lokalny fallback dla `TicketGateway`) |
| Adnotacje JAXB/XML | Praktycznie brak (jeden `@XmlAccessorType` w `ContactIsContactPersonForData`) |
| Zależności Hybris | Brak (puste `<requires>`) |

## Dependencies

- Brak zależności od innych rozszerzeń (pole `requires` puste).
- Konsumenci: `sniezkacore`, `sniezkaintegration`, `sniezkaintegrationws`.

## Kluczowe items

Brak — rozszerzenie nie definiuje żadnych typów w `items.xml`.

## Beans (DTO/JAXB)

| Pakiet/katalog | Kluczowe klasy | System docelowy |
|---|---|---|
| `bean.invoice` | `Invoice`, `InvoiceListRequest`, `InvoiceAcceptRequest` | S/4 (faktury) |
| `bean.deliverynote` | `DeliveryNote`, `DeliveryNoteListRequest`, `DeliveryNoteAcceptRequest` | S/4 (WZ/awiza) |
| `bean.cancelorder` | `CancelOrderRequest` | S/4 (anulowanie zamówień) |
| `bean.paymentinfos4` | `CreateUnclearedDocumentPaymentInfoRequest` | S/4 (info o płatnościach) |
| `bean.goodsissues` | `DocumentRequest`, `DocumentData` | IFS (dokumenty WZ — PDF/XML) |
| `bean.tickets` | `CreateTicketRequestBean`, `CreateTicketResponseBean`, `TicketListData`, `AddAttachmentBean`, `AttachmentResponseData` | C4C (tickety) |
| `bean.contacts` | `ContactData`, `CreateContactRequest`, `UpdateContactRequest`, `DeleteContactRequest`, `ContactIsContactPersonForData` | C4C (kontakty) |
| `bean.bonuses` | `BonusesData`, `BonusPDFData`, `GetBonusesRequest`, `GetBonusPDFRequest` | PSB (premie) |
| `bean.promotions` | `PromotionData`, `GetPromotionsRequest` | PSB (promocje) |
| `bean.creditcheck` | `CreditCheckData`, `GetCreditCheckRequest` | CAR (ocena kredytowa) |
| `bean.reports` | `CreditReportData`, `UnclearedDocumentData` | C4C/S/4 (raporty kredytowe) |
| `bean.gus` | `CustomerSearchResult` | GUS (wyszukiwanie po NIP) |
| `bean.checktaxid` | `CorporateAccountData` | Zewnętrzny rejestr VAT |
| `bean.assets` | `CustomerAsset`, `AssetDetails`, `InstalledBase`, `GetCustomerAssetsIn` | CAR (zainstalowane bazy) |
| `bean.employee` | `User` | C4C/S/4 (dane pracowników) |
| `bean.consent` | `ConsentState` | SAP Marketing (zgody) |
| `bean.b2customer` | `SendCustomerData` | SAP Marketing (wysyłka klienta B2C) |
| `bean.unit` | `B2BUnitUidData` | C4C (uid jednostki B2B) |
| `bean.checkopprtunity` | `OpportunityData` | C4C (szanse sprzedaży) |
| `raports` | `Bestseller`, `BrandShares`, `CurrencyRate` | S/4 (raporty dashboard) |
| `bean.common` | `PageInformation` | Wspólny (paginacja) |

## Gateway interfaces

| Interfejs | System docelowy | Rola |
|---|---|---|
| `InvoicesGateway` | S/4 | Pobieranie listy faktur, akceptacja faktury |
| `OverdueInvoicesGateway` | S/4 | Pobieranie przeterminowanych faktur |
| `DeliveryNotesGateway` | S/4 | Lista i akceptacja dokumentów WZ |
| `OrderGateway` | S/4 | Tworzenie zamówienia w systemie zewnętrznym |
| `CancelOrderGateway` | S/4 | Anulowanie zamówienia |
| `PaymentInfoS4Gateway` | S/4 | Wysyłka informacji o płatności (zamówienie i dok. niespłacone) |
| `DashboardReportGateway` | S/4 | Udziały marki i bestsellery (dashboard B2B) |
| `LogisticMinimumGateway` | S/4 | Minimum logistyczne dla klienta |
| `CurrencyGateway` | S/4 | Kursy walut |
| `PointOfServiceGateway` | S/4 | Lista POS (punkty sprzedaży) |
| `TicketGateway` | C4C | CRUD ticketów + załączniki (z wariantem async) |
| `ContactsGateway` | C4C | CRUD kontaktów (osób kontaktowych) |
| `ContactsPersonForGateway` | C4C | Relacje "kontakt jest osobą kontaktową dla" |
| `ContactsPersonAddressGateway` | C4C | Adresy osób kontaktowych |
| `DeleteContactPersonForGateway` | C4C | Usuwanie relacji kontakt-osoba |
| `ManageContactsGateway` | C4C | Tworzenie/aktualizacja/dezaktywacja użytkownika B2B |
| `CreditLimitsGateway` | C4C | Raport kredytowy + lista niespłaconych dokumentów |
| `CheckOpportunityGateway` | C4C | Sprawdzenie szansy sprzedaży po ID jednostki B2B |
| `OpportunityGateway` | C4C | Wysyłka podpisu do szansy sprzedaży |
| `B2BUnitRegistrationGateway` | C4C | Rejestracja jednostki B2B, tworzenie szansy, pobranie uid |
| `EmployeeGateway` | C4C | Dane pracowników (handlowców) |
| `AssetsGateway` | CAR | Zainstalowane bazy, szczegóły assetów klienta |
| `CreditCheckGateway` | CAR | Ocena kredytowa klienta |
| `GoodsIssuesGateway` | IFS | Pobieranie dokumentów WZ jako PDF/XML |
| `BonusesGateway` | PSB | Lista premii + PDF premii |
| `PromotionGateway` | PSB | Lista promocji |
| `GUSGateway` | GUS | Wyszukiwanie klienta po NIP |
| `CheckTaxIdGateway` | Rejestr VAT | Weryfikacja NIP / dane firmy |
| `ConsentGateway` | SAP Marketing | Odczyt i zapis zgód marketingowych |
| `B2CCustomerGateway` | SAP Marketing | Wysyłka danych klienta B2C |

## Spring beany (selektywnie)

| Bean id | Klasa | Uwaga |
|---|---|---|
| `mockTicketGateway` | `pl.sniezka.integrationapi.gateway.impl.MockTicketGateway` | Jedyna implementacja w tym rozszerzeniu; używana lokalnie zamiast integracji C4C |

## Pułapki / gotchas

- Rozszerzenie **nie posiada żadnych implementacji** poza `MockTicketGateway` — wszystkie realne implementacje żyją w `sniezkaintegration` i `sniezkaintegrationws`. Zmiana interfejsu tutaj wymaga aktualizacji implementacji w obu tych rozszerzeniach.
- `MockTicketGateway` jest zdefiniowany w `sniezkaintegrationapi-spring.xml` i może być aktywny w środowiskach lokalnych, jeśli implementacja z `sniezkaintegration` nie nadpisze beana — weryfikuj, który bean jest aktywny przy debugowaniu ticketów.
- `ServiceException` jest checkowanym wyjątkiem — wszystkie wywołania gateway objęte tym typem wymagają jawnej obsługi `try/catch` lub deklaracji `throws`.
- Brak adnotacji JAXB (`@XmlRootElement` itp.) na większości DTO — serializacja odbywa się przez mechanizmy integracyjne (Spring Integration / CPI), nie przez JAXB bezpośrednio.
- Literówka w pakiecie: `bean.checkopprtunity` (podwójne `r`) — przy imporcie klas uważaj na poprawną nazwę pakietu.
- Rozszerzenie nie definiuje typów Hybris (puste `items.xml`) i nie ma zależności — można je kompilować i testować niezależnie od platformy.

