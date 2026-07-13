use std::{env, fs::File, io::BufWriter, process};

use uesave::SaveReader;

fn main() {
    if let Err(error) = run() {
        eprintln!("GVAS export failed: {error}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let input_path = args.next().ok_or("usage: solar-nations-gvas-export <input.sav> <output.json>")?;
    let output_path = args.next().ok_or("usage: solar-nations-gvas-export <input.sav> <output.json>")?;
    if args.next().is_some() {
        return Err("usage: solar-nations-gvas-export <input.sav> <output.json>".into());
    }

    let save = SaveReader::new()
        .log(false)
        .error_to_raw(true)
        .read(File::open(input_path)?)?;
    serde_json::to_writer(BufWriter::new(File::create(output_path)?), &save)?;
    Ok(())
}
