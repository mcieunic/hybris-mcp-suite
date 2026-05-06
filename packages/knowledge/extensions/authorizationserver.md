# authorizationserver

## Cel
Rozszerzenie OOTB implementujące serwer autoryzacji OAuth 2.0 (oparty na Spring Authorization Server) dla SAP Commerce Cloud. Wystawia tokeny JWT dla klientów REST korzystających z OCC, WebServices i SCPI. Obsługuje grant types: `client_credentials`, `authorization_code` (z PKCE), `refresh_token`.

## Charakter

| Typ         | Status |
|-------------|--------|
| core + web  | OOTB, platform/ext |

Webroot: `/authorizationserver`

## Dependencies

- `oauth2commons` (definiuje `OAuthClientDetails`, `OAuth2AccessToken`, `OAuth2RefreshToken`)

## Kluczowe items

| Type | Deployment table | Ważne atrybuty |
|------|-----------------|----------------|
| `OAuthClientDetails` (z oauth2commons) | `OAuthClientDetails` | `clientId` (unique), `clientSecret`, `scope`, `authorizedGrantTypes`, `accessTokenValiditySeconds`, `refreshTokenValiditySeconds`, `registeredRedirectUri` |
| `SAPOAuth2Authorization` | `SAPOAuth2Authorization` (typecode 6237) | `id`, `accessTokenId`, `refreshTokenId`, `authorizationCodeId`, `authorizationType` (enum), `authorization` (encrypted blob), `expirationTimeMillis` |

`OAuth2AccessToken` i `OAuth2RefreshToken` nie są osobnymi item types — token jest serializowany w polu `authorization` w `SAPOAuth2Authorization`.

## Services / Facades / Strategies

| Bean (alias) | Klasa | Rola |
|---|---|---|
| `authorizationService` | `DefaultOAuth2AuthorizationService` | CRUD na `SAPOAuth2Authorization` |
| `oAuth2RevocationTokenService` | `DefaultOAuth2RevocationTokenService` | Unieważnianie tokenów |
| `clientDetailsRepository` | `DefaultClientDetailsRepository` | Ładowanie klientów OAuth |
| `oAuthClientDetailsService` | `DefaultOAuthClientDetailsService` | DAO-level dostęp do klientów |
| `oAuth2TokenRevocationEventSendingStrategy` | `DefaultOAuth2TokenRevocationEventSendingStrategy` | Wysyłanie eventów przy revocation |

## Spring beany (selektywnie)

| Bean id | Klasa / opis |
|---------|-------------|
| `oAuth2EndpointCustomizer` | `OAuth2EndpointCustomizer` — konfiguruje token/authorize/revocation/introspection endpointy Spring Auth Server |
| `clientDetailsRepository` | `DefaultClientDetailsRepository` — primary, pobiera klientów przez `oauthClientDetailsDao` |
| `disabledClientAwareRepository` | `DisabledClientAwareRepository` — weryfikuje, czy klient jest aktywny |
| `kidJwtCustomizer` | `KidJwtCustomizer` — dodaje `kid` claim do JWT |
| `cleanupOAuth2AuthorizationPerformable` | CronJob czyszczący wygasłe rekordy `SAPOAuth2Authorization` (domyślnie co godzinę, kron: `0 0 * ? * *`) |
| `userTokenRevocationInterceptor` | Interceptor na `User` — revokuje tokeny przy usunięciu/dezaktywacji usera |
| `clientTokenRevocationInterceptor` | Interceptor na `OAuthClientDetails` — revokuje tokeny przy usunięciu klienta |
| `defaultOAuthClientDetailsValidator` | Walidator `OAuthClientDetails` — weryfikuje `loginPageUri`, allowed hosts |
| `oAuth2AuthorizationConsentService` | `NoOpOAuth2AuthorizationConsentService` — brak UI zgody, auto-approve |

## Endpointy OAuth

- `/authorizationserver/oauth/token` (POST) — emisja tokenów (client_credentials, refresh_token)
- `/authorizationserver/oauth/authorize` (GET) — authorization_code flow (przeglądarkowy, PKCE)
- `/authorizationserver/oauth/token_revocation` (POST) — RFC 7009 revocation
- `/authorizationserver/oauth/introspect` (POST) — weryfikacja tokenu
- Konfiguracja zabezpieczeń: `authorizationServerSecurityFilterChain` / `defaultSecurityFilterChain` w `authorizationserver-web-app-config.xml`

## Klient OOTB

OOTB rozszerzenie nie importuje gotowych klientów — definiuje je każde rozszerzenie (np. `sniezkainitialdata`). Wzorzec impex z testów:

```impex
INSERT_UPDATE OAuthClientDetails; clientId[unique = true]; resourceIds; scope    ; authorizedGrantTypes                                         ; authorities         ; clientSecret; registeredRedirectUri
                                ; trusted_client         ; hybris     ; extended ; authorization_code,refresh_token,password,client_credentials ; ROLE_TRUSTED_CLIENT ; secret      ;
                                ; mobile_android         ; hybris     ; basic    ; authorization_code,refresh_token,password,client_credentials ; ROLE_CLIENT         ; secret      ; http://localhost:9001/authorizationserver/oauth2_callback
                                ; client-side            ; hybris     ; basic    ; implicit,client_credentials                                  ; ROLE_CLIENT         ; secret      ; http://localhost:9001/authorizationserver/oauth2_implicit_callback
```

- `trusted_client` — scope `extended`, `ROLE_TRUSTED_CLIENT`, brak redirect URI (używany server-side / OCC)
- `mobile_android` — scope `basic`, redirect URI, authorization_code + refresh_token
- Scope `basic` = dostęp do podstawowych zasobów OCC; `extended` = pełny dostęp (B2B, ceny, koszyk zalogowanego)

## Pułapki / gotchas

- Domyślny TTL access tokenu to **300 s** (`authserver.accessToken.timeToLive.seconds`); refresh tokenu **3600 s** — można nadpisać per-klient przez `accessTokenValiditySeconds` / `refreshTokenValiditySeconds` w `OAuthClientDetails`.
- Refresh token **nie jest reużywany** domyślnie (`authserver.refreshToken.reuse=false`) — każde odświeżenie zwraca nowy refresh token.
- Zmiana hasła usera revokuje wszystkie jego tokeny (`oauth2.revoke.tokens.on.user.password.change=true`).
- `SAPOAuth2Authorization.authorization` jest **encrypted** i serializowany binarnie — nie można łatwo odczytać z DB bez deserialization.
- Sesja na `/authorizationserver` wygasa po **300 s** (property `authorizationserver.session.timeout`) — dotyczy flow authorization_code.
- CORS jest konfigurowany przez `corsfilter.authorizationserver.*` w `project.properties`; domyślnie `allowedOrigins=*`.
- `oAuth2AuthorizationConsentService` jest `NoOp` — zgoda OAuth zawsze auto-approve (brak strony consent dla end-usera).
- `authserver.oauthclientdetails.loginpageuri.allowed.hosts` — puste domyślnie; przy customowym login page OAuth trzeba jawnie dodać hosta, inaczej walidator odrzuci klienta.
- Cleanup wygasłych `SAPOAuth2Authorization` ma dodatkowe opóźnienie 300 s (`authserver.cleanup.cronjob.additional.delay.to.fetch.expired.records.seconds`) — rekordy mogą przez chwilę istnieć po wygaśnięciu.

