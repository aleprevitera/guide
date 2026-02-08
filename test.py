import pandas as pd
import plotly.express as px
google_sheet = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQoGWgTG_X3IKj2_eJiVzeah-Tcn3BjhiLQZk3VyuxTVYeTH7vd834YOWT5Ka1feLrFG0Q5ksT4Cqn0/pub?output=csv'

df = pd.read_csv(google_sheet)
distribuzione = df[['MACROARGOMENTO', 'DOMANDA']].groupby('MACROARGOMENTO').count()

fig = px.bar(distribuzione, x=distribuzione.index, y='DOMANDA')
fig.show()