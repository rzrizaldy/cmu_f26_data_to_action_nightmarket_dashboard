# Pittsburgh Night Market Explorer

Where should Pittsburgh's next night market pop up? This dashboard maps card spending, footfall and bus traffic for every city neighborhood, month by month since 2023, alongside every night market that was scheduled.

**Live site:** https://rzrizaldy.github.io/cmu_f26_data_to_action_nightmarket_dashboard/

Made by Dominick, Nate, Rizaldy and Sean for **CMU From Data to Action, Fall 2026**.

## What's here

- **Explore:** a neighborhood map with a layer picker (spending, footfall, evening footfall, bus traffic, population density), market pins, and a month timeline drawn as a string of lights. Beside it, trends and rankings for the city or the neighborhood you click.
- **Optimization lab** and **Recommendation:** still being built. They will show the optimization model and its recommended neighborhoods and dates.

## Data

`data/` holds only aggregates, built from the project's private data mart:

- Dewey / Advan spend patterns and Weekly Patterns Plus, **licensed**, published only as neighborhood and city totals per month
- Pittsburgh Regional Transit ridership and GTFS stops
- WPRDC neighborhood boundaries
- UCSUR *Profiles of Change 2014–2024* (ACS 5-year) population
- A researched inventory of night markets scheduled in the city, 2023–2026

Market pins sit at the middle of each neighborhood, not at the exact venue. Basemap © Esri.

This repository is generated from the `dashboard/` folder of the team's private working repo. Change things there, then publish. Edits made directly here are overwritten.
