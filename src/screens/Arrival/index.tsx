import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { BSON } from 'realm';
import { useNavigation, useRoute } from '@react-navigation/native';
import { X } from 'phosphor-react-native';
import { LatLng } from 'react-native-maps';
import dayjs from 'dayjs';

import { useRealm, useObject } from '../../libs/realm';
import { Historic } from '../../libs/realm/schemas/Historic';
import { getLastAsyncTimestamp } from '../../libs/asyncStorage/syncStorage';

import { Loading } from '../../components/Loading';
import { Header } from '../../components/Header';
import { Button } from '../../components/Button';
import { ButtonIcon } from '../../components/ButtonIcon';
import { Map } from '../../components/Map';
import { Locations } from '../../components/Locations';
import { LocationInfoProps } from '../../components/LocationInfo';

import { stopLocationTask } from '../../tasks/backgroundLocationTask';
import { getStorageLocations } from '../../libs/asyncStorage/locationStorage';
import { getAddressLocation } from '../../utils/getAddressLocation';

import { 
  AsyncMessage, Container, Content,
  Description, Footer, Label, LicensePlate 
} from './styles';

type RouteParamProps = {
  id: string;
}

export function Arrival() {
  const route = useRoute();
  const realm = useRealm();
  const { goBack } = useNavigation();

  const [dataNotSynced, setDataNotSynced] = useState(false);
  const [coordinates, setCoordinates] = useState<LatLng[]>([])
  const [departure, setDeparture] = useState<LocationInfoProps>({} as LocationInfoProps)
  const [arrival, setArrival] = useState<LocationInfoProps | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const { id } = route.params as RouteParamProps;

  const historic = useObject(Historic, new BSON.UUID(id) as unknown as string);

  const title = historic?.status === 'departure' ? 'Chegada' : 'Detalhes';

  function handleRemoveVehicleUsage() {
    Alert.alert(
      'Cancelar',
      'Cancelar a utilização do veículo?',
      [
        { text: 'Não', style: 'cancel' },
        { text: 'Sim', onPress: () => removeVehicleUsage() },
      ]
    )
  }

  async function removeVehicleUsage() {
    realm.write(() =>{
      realm.delete(historic)
    });

    await stopLocationTask()

    goBack();
  }

  async function handleArrivalRegister() {
    try {
      if(!historic) {
        return Alert.alert('Erro', 'Não foi possível obter os dados para registrar a chegada do veículo.')
      }

      const locations = await getStorageLocations()

      realm.write(() => {
        historic.status = 'arrival';
        historic.updated_at = new Date();
        historic.coords.push(...locations)
      });

      await stopLocationTask()

      Alert.alert('Chegada', 'Chegada registrada com sucesso.');
      goBack();

    } catch (error) {
      Alert.alert('Erro', "Não foi possível registar a chegada do veículo.")
    }
  }

  async function getLocationsInfo() {
    const lastSync = await getLastAsyncTimestamp();
    const updatedAt= historic!.updated_at.getTime(); 
    setDataNotSynced(updatedAt > lastSync);

    if(historic?.status === 'departure') {
      const locationsStorage = await getStorageLocations();
      setCoordinates(locationsStorage);
    } else {
      setCoordinates(historic?.coords ?? []);
    }

    if(historic?.coords[0]) {
      const departureStreetName = await getAddressLocation(historic?.coords[0])

      setDeparture({
        label: `Saíndo em ${departureStreetName ?? ''}`,
        description: dayjs(new Date(historic?.coords[0].timestamp)).format('DD/MM/YYYY [às] HH:mm')
      })
    }

    if(historic?.status === 'arrival') {
      const lastLocation = historic.coords[historic.coords.length - 1];
      const arrivalStreetName = await getAddressLocation(lastLocation)

      setArrival({
        label: `Chegando em ${arrivalStreetName ?? ''}`,
        description: dayjs(new Date(lastLocation.timestamp)).format('DD/MM/YYYY [às] HH:mm')
      })
    }

    setIsLoading(false)
  }

  useEffect(() => {
    getLocationsInfo()
  },[historic])

  if(isLoading) {
    return <Loading />
  }

  return (
    <Container>
      <Header title={title} />

      {coordinates.length > 0 && (
        <Map coordinates={coordinates.map(({ latitude, longitude }) => ({ latitude, longitude }))} />
      )}

      <Content>
        <Locations departure={departure} arrival={arrival} />

        <Label>
          Placa do veículo
        </Label>

        <LicensePlate>
          {historic?.license_plate}
        </LicensePlate>

        <Label>
          Finalidade
        </Label>

        <Description>
          {historic?.description}
        </Description>
      </Content>

      {historic?.status === 'departure' ? (
        <Footer>
          <ButtonIcon 
            icon={X} 
            onPress={handleRemoveVehicleUsage}
          />

          <Button 
            title='Registrar chegada' 
            onPress={handleArrivalRegister}
          />
        </Footer>
      ) : null}

      {dataNotSynced && (
        <AsyncMessage>
          Sincronização da {historic?.status === 'departure'? "partida" : "chegada"} pendente
        </AsyncMessage>
      )}
    </Container>
  );
}