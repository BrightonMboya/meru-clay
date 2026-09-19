import Hero from '@/components/marketing/Hero';
import About from '@/components/marketing/About';
import Courts from '@/components/marketing/Courts';
import Pricing from '@/components/marketing/Pricing';
import Team from '@/components/marketing/Team';
import Visit from '@/components/marketing/Visit';
import Cta from '@/components/marketing/Cta';
import Footer from '@/components/marketing/Footer';

export default function Home() {
  return (
    <>
      <main>
        <Hero />
        <About />
        <Courts />
        <Pricing />
        <Team />
        <Visit />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
