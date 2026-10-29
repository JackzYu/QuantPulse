import { useEffect, useState } from 'react'
import logo from './assets/logo.png'
import './App.css'



function App() {
  const [message, setMessage] = useState('Waiting for backend...')
  const [stock, setStock] = useState(null)
  const [symbol, setSymbol] = useState('')
  useEffect(() => {
    fetch('http://127.0.0.1:8000/stock')
      .then((response) => response.json())
      .then((data) => {
        setStock(data)
        setMessage('')
      })
      .catch((error) => {
        console.error('Request failed:', error)
        setMessage('Could not connect to backend.')
      })
  }, [])
  function searchStock() {
    setMessage('Loading...')
    setStock(null)

    fetch(`http://127.0.0.1:8000/stock?symbol=${symbol}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Stock request failed')
        }
        return response.json()
      })
      .then((data) => {
        setStock(data)
        setMessage('')
      })
      .catch((error) => {
        console.error('Request failed:', error)
        setMessage('Could not load stock.')
      })
  }
  return (
    <main>
      <header className="brand">
        <img src={logo} alt="QuantPulse logo" width="64" />
        <h1>QuantPulse</h1>
      </header>

      <p>Explore stocks. Discover factors. Test strategies.</p>
      <input
        type="text"
        placeholder="Enter stock symbol"
        value={symbol}
        onChange={(event) => setSymbol(event.target.value)}
      />
      <button onClick={searchStock}>Search</button>
      <p>You entered: {symbol}</p>
      <p>{message}</p>
      {stock && (
        <section>
          <h2>{stock.symbol}</h2>
          <p>{stock.name}</p>
          <p>Example price: ${stock.price}</p>
        </section>
      )}
    </main>
  )
}

export default App