# Benji Badger Bot

## Motivation

This project came about after my brother's dog, Benji, went missing. After nearly 4 long days and nights searching for him (and increasingly coming to terms with the worst case scenario), he was retreived safe and sound from an inactive badger sett. The search was coordinated by a group of volunteers, known as K9 SARs. They've been wanting to invest in equipment to help them investigate burrows and setts that are known to be inactive.

## Goal

To create a simple robot capable of remote control under dense ground.

* Small enough to explore inactive badger setts
* Front facing camera & lights
* Mobile phone control - should feel natural to drive
* Remote control, but tethered for retreival

## Design

We are exploring a tracked vehicle which will have onboard power. However, rather than a wireless signal which may be prone to dropping, it will use fiber optics.

![Functional Block Diagram](https://raw.githubusercontent.com/garethbradley/benji-badger-bot/refs/heads/main/docs/assets/functional_diagram.svg)

## Running Locally

The system relies on a python script running in the background (handles GPIO, connection status and camera enumeration/streaming). By default, this server runs on `127.0.0.1:8080`.

### Installing the Backend

```shell
> pip install -r ./firmware/requirements.txt
```

_note: this uses opencv which can take several hours to build on a RaspberryPI (over 10 hours in some reported cases)._

### Running the Backend

```shell
> python ./firmware/gpio-server.py
```

### Running the Frontend

The frontend is a simple single page application with no dependencies. It can be run with any webserver, but for the purposes of testing, it can be convenient to use the built in python server.

```shell
> cd ./firmware
> python -m http.server
```
