# References: where the HeatCheck parameters and rules come from

Checked 24 Oct 2026: all 13 links open (Zenodo blocks scripts with 403; the record was confirmed via its API).
"Verified" = the claim was found in the source text; other sources were opened but not checked line by line.

## Which rule rests on which source

| Rule in the tool | Source |
|---|---|
| Building age alone never rules a home out | **Fraunhofer ISE (10), verified:** "No correlation between the year of construction of the buildings and the efficiency of the heat pump was found" (77 heat pumps, SPF 2.6–5.4) |
| Around 55 °C flow temperature is a screening reference, not a pass/fail line | **Verbraucherzentrale (7), verified:** rule of thumb "Vorlauftemperatur … möglichst ganzjährig unter 55 Grad Celsius" |
| Radiators can work; small radiators are a check, not a no | **Fraunhofer ISE (10), verified:** adequately sized radiators run at similarly low temperatures as underfloor heating. **Verbraucherzentrale (7), verified:** too-small radiators are a common efficiency problem |
| Wall/ceiling heating treated like underfloor (low temperature) | **Verbraucherzentrale (7), verified:** large heating surfaces such as underfloor or wall heating allow low water temperatures |
| Insulation lowers the load; > 75 W/m² gives an insulation hint | **Verbraucherzentrale (7, 8):** insulation and heat protection improve efficiency and cost; challenge guardrails for the 75 W/m² figure |
| Uneven heating / hydraulic balancing → technician check | **Verbraucherzentrale (7), verified:** hydraulic balancing is important |
| Exact heat load is always checked room by room on site; the tool is a first assessment | **Umweltbundesamt (9), verified:** heat load and radiator output "Raum für Raum". **nuuEnergy (5, 6):** on-site heat-load calculation before system design. (The "not a replacement for professional planning" wording was not found in the fetched text: partly verified.) |
| Single-pipe = closer review, not a rejection | nuuEnergy challenge background page (kit) and website ("meist nicht geeignet" → strong flag with ways forward) |
| Question list (home type, ownership, heater age, timing, contact) | **Enpal (1), Aira (2), thermondo FAQ (3)** intake forms and processes |
| Photo tasks (meter cabinet, heating room, radiators/manifold, outdoor spot, access route) | **thermondo photo guide (4)** |
| Visit tiers follow the real funnel (check → 30-min call → on-site visit → design) | **nuuEnergy (5, 6)** |
| Address/age data only as estimates to confirm | **ETHOS.BUILDA (11)** (TABULA archetype dataset, ODbL), **TABULA/EPISCOPE (12)** (typical assumptions, not an individual address), **Destatis Census 2022 (13)** (area-level context only) |
| All formulas and fixed prices (W/m² bands, 0.88, 2,000 h, JAZ 4.0/3.5/2.8, prices) | nuuEnergy challenge **Technical Guardrails** (`kit/docs/Technical_Guardrails.txt`) |

## Sources

Competitor intake and installation process
1. Enpal: heat-pump offer form. https://www.enpal.de/waermepumpe/angebot
2. Aira: installation process. https://company.airahome.com/de-de/installation
3. thermondo: frequently asked questions. https://www.thermondo.de/leistungen/faq/
4. thermondo: photo guide. https://www.thermondo.de/kunde/fotoanleitung/
5. nuuEnergy: customer process. https://www.nuuenergy.com/
6. nuuEnergy: installation planning. https://www.nuuenergy.com/ablauf-baustellen

Technical readiness factors
7. Verbraucherzentrale: heat-pump suitability in existing homes. https://www.verbraucherzentrale.de/wissen/energie/heizen-und-warmwasser/waermepumpe-im-eigenheim-welche-voraussetzungen-muss-mein-haus-erfuellen-113948
8. Verbraucherzentrale: heat-pump overview. https://www.verbraucherzentrale.de/wissen/energie/heizen-und-warmwasser/waermepumpe-alles-was-sie-wissen-muessen-5439
9. Umweltbundesamt: Gebäudecheck Wärmepumpe. https://www.umweltbundesamt.de/themen/klima-energie/erneuerbare-energien/umgebungswaerme-waermepumpen/gebaeudecheck-waermepumpe
10. Fraunhofer ISE: heat pumps in existing buildings (2025). https://www.ise.fraunhofer.de/en/press-media/press-releases/2025/fraunhofer-ise-research-project-completed-heat-pumps-provide-climate-friendly-heating-in-existing-buildings.html

Building-age and address data
11. ETHOS.BUILDA: Residential Building TABULA Archetype Dataset Germany (2024, ODbL). https://zenodo.org/records/12069755
12. TABULA / EPISCOPE: building typologies. https://episcope.eu/building-typology/overview/
13. Destatis: Census 2022 building data. https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_inhalt.htm
