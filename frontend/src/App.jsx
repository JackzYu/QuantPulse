import logo from './assets/logo.png'
import './App.css'

function App() {
  return (
    <main>
      <header className="brand">
        <img src={logo} alt="QuantPulse logo" width="64" />
        <h1>QuantPulse</h1>
      </header>

      <p>Explore stocks. Discover factors. Test strategies.</p>
    </main>
  )
}

export default App