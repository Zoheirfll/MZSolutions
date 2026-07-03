export default function Logo(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" fill="none" {...props}>
      {/* Lettre M */}
      <path d="M20,80 L20,30 L40,60 L60,30 L60,80" stroke="currentColor" strokeWidth="8" strokeLinejoin="round" />
      {/* Lettre Z stylisée connectée */}
      <path d="M75,30 L115,30 L75,80 L115,80" stroke="currentColor" strokeWidth="8" strokeLinejoin="round" />
      {/* Flèche ascendante vers le nœud tech */}
      <path d="M95,55 L145,15" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <circle cx="145" cy="15" r="7" fill="currentColor" />
      {/* Lettre S */}
      <path d="M175,30 C155,30 150,45 165,55 C180,65 175,80 150,80" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
